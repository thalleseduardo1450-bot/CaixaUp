export type NextarProductRow = {
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  salePrice: number;
  supplier: string;
};

export type NextarCustomerRow = {
  name: string;
  document: string;
  birthDate: string;
  cep: string;
  city: string;
  state: string;
  address: string;
  neighborhood: string;
  complement: string;
  number: string;
  telephone: string;
  cellphone: string;
  email: string;
};

export type NextarImportResult<T> = {
  records: T[];
  skipped: number;
};

const PRODUCT_HEADERS = {
  name: ["produto", "nome", "nome do produto", "descricao", "descrição"],
  code: ["codigo", "código", "cod. produto", "cód. produto", "codigo de barras", "código de barras", "barcode", "ean", "ean / gtin", "gtin", "sku"],
  quantity: ["estoque", "quantidade", "qtd", "saldo", "estoque atual"],
  unitPrice: ["preco de custo", "preço de custo", "custo", "valor de custo", "preco compra"],
  salePrice: ["preco de venda", "preço de venda", "preco venda", "preço venda", "venda", "valor de venda", "valor unitario", "valor unitário", "preco", "preço"],
  supplier: ["fornecedor", "fornecedor principal", "marca", "fabricante"],
} as const;

const CUSTOMER_HEADERS = {
  name: ["cliente", "nome", "nome do cliente", "razao social", "razão social"],
  document: ["cpf/cnpj", "cpf / cnpj", "cpf cnpj", "documento", "cpf", "cnpj"],
  birthDate: ["data de nascimento", "nascimento", "data nascimento", "dn"],
  cep: ["cep", "codigo postal", "código postal"],
  city: ["cidade", "municipio", "município"],
  state: ["estado", "uf"],
  address: ["endereco", "endereço", "logradouro", "rua"],
  neighborhood: ["bairro"],
  complement: ["complemento"],
  number: ["numero", "número"],
  telephone: ["telefone", "fone", "telefone fixo"],
  cellphone: ["celular", "telefone celular", "whatsapp"],
  email: ["email", "e-mail"],
} as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function expandEmbeddedRows(rows: string[][]) {
  return rows.map((row) => {
    if (row.length !== 1) return row;
    const content = row[0] ?? "";
    const delimiter = detectDelimiter(content);
    return content.split(delimiter).length > 1 ? splitCsvLine(content, delimiter) : row;
  });
}

function splitCsvLine(line: string, delimiter: string) {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === delimiter && !quoted) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  fields.push(current.trim());
  return fields;
}

function detectDelimiter(header: string) {
  return [";", "\t", ","].sort(
    (left, right) => header.split(right).length - header.split(left).length,
  )[0];
}

function parseTextRows(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headerCandidate = lines
    .slice(0, 20)
    .sort((left, right) =>
      Math.max(...[";", "\t", ","].map((delimiter) => right.split(delimiter).length)) -
      Math.max(...[";", "\t", ","].map((delimiter) => left.split(delimiter).length)),
    )[0];
  const delimiter = detectDelimiter(headerCandidate);
  return lines.map((line) => splitCsvLine(line, delimiter));
}

export async function readNextarRows(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const bytes = await file.arrayBuffer();

  if (extension === "csv" || extension === "txt") {
    let content = new TextDecoder("utf-8").decode(bytes);
    if (content.includes("�")) content = new TextDecoder("windows-1252").decode(bytes);
    return parseTextRows(content);
  }

  const { read, utils } = await import("@e965/xlsx");
  const workbook = read(bytes, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  return utils
    .sheet_to_json<Array<string | number | boolean>>(workbook.Sheets[firstSheetName], {
      header: 1,
      raw: false,
      defval: "",
      dateNF: "yyyy-mm-dd",
    })
    .map((row) => row.map((cell) => String(cell).trim()))
    .filter((row) => row.some(Boolean));
}

function parseNumber(value: string) {
  const clean = value.replace(/[^0-9,.-]/g, "").trim();
  if (!clean) return 0;

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  let normalized = clean;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    normalized = clean.split(thousandSeparator).join("").replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else if ((clean.match(/\./g) ?? []).length > 1) {
    normalized = clean.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findColumn(headers: string[], aliases: readonly string[]) {
  const normalizedAliases = aliases.map(normalize);
  const normalizedHeaders = headers.map(normalize);
  const exactIndex = normalizedHeaders.findIndex((header) =>
    normalizedAliases.includes(header),
  );
  if (exactIndex >= 0) return exactIndex;

  const aliasesBySpecificity = [...normalizedAliases].sort(
    (left, right) => right.length - left.length,
  );
  return normalizedHeaders.findIndex((header) =>
    aliasesBySpecificity.some(
      (alias) => header.startsWith(`${alias} `) || header.endsWith(` ${alias}`),
    ),
  );
}

function findHeaderRow(
  rows: string[][],
  requiredAliases: ReadonlyArray<readonly string[]>,
) {
  return rows.findIndex((row) =>
    requiredAliases.every((aliases) => findColumn(row, aliases) >= 0),
  );
}

function normalizeDate(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const match = clean.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

export function parseNextarProducts(rows: string[][]): NextarImportResult<NextarProductRow> {
  const expandedRows = expandEmbeddedRows(rows);
  const headerIndex = findHeaderRow(expandedRows, [
    PRODUCT_HEADERS.name,
    PRODUCT_HEADERS.code,
    PRODUCT_HEADERS.salePrice,
  ]);
  if (headerIndex < 0) {
    throw new Error(
      "O arquivo precisa ter Produto/Nome, Código/Código de barras e Preço de venda.",
    );
  }

  const headers = expandedRows[headerIndex];
  const columns = {
    name: findColumn(headers, PRODUCT_HEADERS.name),
    code: findColumn(headers, PRODUCT_HEADERS.code),
    quantity: findColumn(headers, PRODUCT_HEADERS.quantity),
    unitPrice: findColumn(headers, PRODUCT_HEADERS.unitPrice),
    salePrice: findColumn(headers, PRODUCT_HEADERS.salePrice),
    supplier: findColumn(headers, PRODUCT_HEADERS.supplier),
  };

  const uniqueProducts = new Map<string, NextarProductRow>();
  let skipped = 0;

  for (const cells of expandedRows.slice(headerIndex + 1)) {
    const name = cells[columns.name]?.trim() ?? "";
    const code = cells[columns.code]?.trim() ?? "";
    const salePrice = parseNumber(cells[columns.salePrice] ?? "");
    if (name.length < 2 || !code || salePrice <= 0) {
      skipped += 1;
      continue;
    }

    const quantity = Math.max(0, Math.floor(parseNumber(cells[columns.quantity] ?? "0")));
    const parsedUnitPrice = parseNumber(cells[columns.unitPrice] ?? "");
    const supplier = cells[columns.supplier]?.trim() || "Importado do Nex";
    uniqueProducts.set(normalize(code), {
      name,
      code,
      quantity,
      unitPrice: parsedUnitPrice > 0 ? parsedUnitPrice : salePrice,
      salePrice,
      supplier,
    });
  }

  return { records: [...uniqueProducts.values()], skipped };
}

export function parseNextarCustomers(rows: string[][]): NextarImportResult<NextarCustomerRow> {
  const expandedRows = expandEmbeddedRows(rows);
  const headerIndex = expandedRows.findIndex(
    (row) =>
      findColumn(row, CUSTOMER_HEADERS.name) >= 0 &&
      Object.values(CUSTOMER_HEADERS).filter((aliases) => findColumn(row, aliases) >= 0).length >= 2,
  );
  if (headerIndex < 0) {
    throw new Error("O arquivo precisa ter a coluna Cliente ou Nome.");
  }

  const headers = expandedRows[headerIndex];
  const columns = Object.fromEntries(
    Object.entries(CUSTOMER_HEADERS).map(([key, aliases]) => [key, findColumn(headers, aliases)]),
  ) as Record<keyof typeof CUSTOMER_HEADERS, number>;
  const uniqueCustomers = new Map<string, NextarCustomerRow>();
  let skipped = 0;

  for (const [rowIndex, cells] of expandedRows.slice(headerIndex + 1).entries()) {
    const value = (column: number) => (column >= 0 ? cells[column]?.trim() ?? "" : "");
    const name = value(columns.name);
    if (name.length < 2) {
      skipped += 1;
      continue;
    }

    const document = value(columns.document).replace(/\D/g, "");
    const email = value(columns.email).toLowerCase();
    const cellphone = value(columns.cellphone);
    const telephone = value(columns.telephone);
    const phone = (cellphone || telephone).replace(/\D/g, "");
    const identity = document || email || (phone ? `${normalize(name)}|${phone}` : `${normalize(name)}|linha-${rowIndex}`);
    uniqueCustomers.set(identity, {
      name,
      document,
      birthDate: normalizeDate(value(columns.birthDate)),
      cep: value(columns.cep).replace(/\D/g, ""),
      city: value(columns.city),
      state: value(columns.state).slice(0, 2).toUpperCase(),
      address: value(columns.address),
      neighborhood: value(columns.neighborhood),
      complement: value(columns.complement),
      number: value(columns.number),
      telephone,
      cellphone,
      email,
    });
  }

  return { records: [...uniqueCustomers.values()], skipped };
}

export function formatImportMoney(value: number) {
  return value.toFixed(2).replace(".", ",");
}

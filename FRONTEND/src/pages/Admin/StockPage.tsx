import { AlertTriangle, Boxes, PackageCheck, PackageX, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import LoadingBar from "@/components/Loading/LoadingBar";
import PageLayout from "@/layout/PageLayout";
import { productService, type ProductDto } from "@/services/api/productService";

function stockOf(product: ProductDto) {
  const value = Number(product.productQnt);
  return Number.isFinite(value) ? value : 0;
}

function money(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return (Number.isFinite(parsed) ? parsed : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function StockPage() {
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProducts(await productService.list());
    } catch (loadError) {
      setProducts([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os dados. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return products;
    return products.filter(
      (product) =>
        product.productName.toLocaleLowerCase("pt-BR").includes(term) ||
        product.productCode.toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [products, search]);

  const stockUnits = products.reduce((sum, product) => sum + stockOf(product), 0);
  const outOfStock = products.filter((product) => stockOf(product) <= 0).length;
  const available = products.length - outOfStock;

  return (
    <PageLayout size="wide">
      <PageHeader
        title="Estoque e inventário"
        description="Consulte as quantidades atuais dos produtos cadastrados."
        action={
          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={loading}
            className="btn-outline-secondary inline-flex items-center gap-2"
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
            Atualizar estoque
          </button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="card p-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
            <Boxes size={20} />
          </span>
          <p className="mt-3 text-sm text-text-secondary">Unidades em estoque</p>
          <p className="text-2xl font-bold text-text-primary">{stockUnits.toLocaleString("pt-BR")}</p>
        </article>
        <article className="card p-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
            <PackageCheck size={20} />
          </span>
          <p className="mt-3 text-sm text-text-secondary">Produtos disponíveis</p>
          <p className="text-2xl font-bold text-text-primary">{available}</p>
        </article>
        <article className="card p-4">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PackageX size={20} />
          </span>
          <p className="mt-3 text-sm text-text-secondary">Produtos sem estoque</p>
          <p className="text-2xl font-bold text-text-primary">{outOfStock}</p>
        </article>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-border-primary p-4">
          <label className="relative block w-full max-w-xl">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-field w-full pl-11"
              placeholder="Pesquisar por produto ou código"
              aria-label="Pesquisar no estoque"
            />
          </label>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center">
            <LoadingBar />
          </div>
        ) : error ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center" role="alert">
            <AlertTriangle size={34} className="text-primary" />
            <p className="mt-3 font-semibold text-text-primary">Não foi possível carregar o estoque.</p>
            <p className="mt-1 max-w-lg text-sm text-text-secondary">{error}</p>
            <button type="button" onClick={() => void loadProducts()} className="btn-primary mt-4">
              Tentar novamente
            </button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
            <Boxes size={36} className="text-text-tertiary" />
            <p className="mt-3 font-semibold text-text-primary">Nenhum produto encontrado</p>
            <p className="mt-1 text-sm text-text-secondary">
              {search ? "Tente pesquisar por outro nome ou código." : "Cadastre produtos para acompanhar o inventário."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-bg-primary text-left text-text-secondary">
                <tr>
                  <th className="px-5 py-3">Produto</th>
                  <th className="px-5 py-3">Código</th>
                  <th className="px-5 py-3">Categoria</th>
                  <th className="px-5 py-3 text-right">Preço</th>
                  <th className="px-5 py-3 text-right">Estoque atual</th>
                  <th className="px-5 py-3">Situação</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const stock = stockOf(product);
                  return (
                    <tr key={product.id} className="border-t border-border-primary hover:bg-hover-light/60">
                      <td className="px-5 py-4 font-semibold text-text-primary">{product.productName || "Produto sem nome"}</td>
                      <td className="px-5 py-4 text-text-secondary">{product.productCode || "-"}</td>
                      <td className="px-5 py-4 text-text-secondary">{product.productSupplier || "Sem categoria"}</td>
                      <td className="px-5 py-4 text-right font-semibold text-text-primary">{money(product.productSalePrice)}</td>
                      <td className="px-5 py-4 text-right text-base font-bold text-text-primary">{stock.toLocaleString("pt-BR")}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${stock > 0 ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
                          {stock > 0 ? "Disponível" : "Sem estoque"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageLayout>
  );
}

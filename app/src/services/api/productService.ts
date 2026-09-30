import { squareApi } from "@/services/api/squareApi";

export type ProductDto = {
  id: string;
  productImageUrl: string;
  productImageName: string;
  productName: string;
  productCode: string;
  productAlternateCode?: string;
  productSupplier: string;
  productDescription: string;
  productQnt: string;
  productUnitPrice: string;
  productSalePrice: string;
  totalPriceOnProduct: string;
  productActive?: boolean;
};

export type ProductPayload = Omit<ProductDto, "id">;

export const productService = {
  list(options: { includeInactive?: boolean } = {}) {
    return squareApi<ProductDto[]>(`/products?includeInactive=${options.includeInactive === true}`);
  },
  create(payload: ProductPayload) {
    return squareApi<ProductDto>("/products", { method: "POST", body: JSON.stringify(payload) });
  },
  update(id: string, payload: ProductPayload) {
    return squareApi<ProductDto>(`/products/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
  },
  restore(id: string) {
    return squareApi<void>(`/products/${encodeURIComponent(id)}/restore`, { method: "PUT" });
  },
  remove(id: string) {
    return squareApi<void>(`/products/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
};

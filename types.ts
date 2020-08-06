type Image = {
  id: number;
  url: string;
  name: string;
};
type Category = {
  id: string;
  name: string;
};
type Product = {
  id: string;
  name: string;
  price: number;
  description: string;
  images: { url: string; name: string }[];
  store: { id: string; name: string };
};
type Store = {
  id: string;
  name: string;
  store_address: string;
  categories: { id: string; name: string }[];
  top_sellers: Product[];
};
type StorePreview = { name: string };
type ProductPreview = { name: string; images: { url: string; name: string }[] };

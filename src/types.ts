export type Card = {
  key: string;
  number: number;
  title: string;
  cats: string[];
  cat: string;
  free: boolean;
  image: null | {
    src: string;
    srcSet: string;
    original: string;
    count: number;
  };
};
export type Detail = Card & {
  images: string[];
  prompt: string | null;
  locked: boolean;
  copyEnabled: boolean;
};
export type Config = {
  header: { title?: string; sub1?: string; sub2?: string };
  categories: { id: string; label: string }[];
  freeMode: "off" | "partial" | "full" | "catalog";
  shareWhatsApp: boolean;
  wa: {
    phone?: string;
    purchaseMsg?: string;
    favsPrefix?: string;
    orderMsg?: string;
    sessionMsg?: string;
  };
  modal: {
    price?: string;
    bullets?: string[];
    buyText?: string;
    buyUrl?: string;
  };
  services: Record<string, unknown>;
};
export type Catalog = {
  items: Card[];
  total: number;
  catalogTotal: number;
  page: number;
  pages: number;
  revision: string;
  stale: boolean;
  config: Config;
};
export type Selection = {
  q: string;
  category: string;
  page: number;
  favorites: boolean;
};

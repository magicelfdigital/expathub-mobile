export type Region =
  | "Europe"
  | "North America"
  | "Central America"
  | "South America"
  | "Asia"
  | "Oceania";

export type Country = {
  name: string;
  slug: string;
  region: Region;
  popular?: boolean;
};

export const COUNTRIES: Country[] = [
  { name: "Austria", slug: "austria", region: "Europe" },
  { name: "Denmark", slug: "denmark", region: "Europe" },
  { name: "France", slug: "france", region: "Europe", popular: true },
  { name: "Germany", slug: "germany", region: "Europe" },
  { name: "Greece", slug: "greece", region: "Europe" },
  { name: "Ireland", slug: "ireland", region: "Europe" },
  { name: "Italy", slug: "italy", region: "Europe" },
  { name: "Malta", slug: "malta", region: "Europe" },
  { name: "Netherlands", slug: "netherlands", region: "Europe" },
  { name: "Norway", slug: "norway", region: "Europe" },
  { name: "Portugal", slug: "portugal", region: "Europe", popular: true },
  { name: "Spain", slug: "spain", region: "Europe", popular: true },
  { name: "Sweden", slug: "sweden", region: "Europe" },
  { name: "Switzerland", slug: "switzerland", region: "Europe" },
  { name: "United Kingdom", slug: "united-kingdom", region: "Europe" },
  { name: "Canada", slug: "canada", region: "North America" },
  { name: "Mexico", slug: "mexico", region: "North America", popular: true },
  { name: "Belize", slug: "belize", region: "Central America" },
  { name: "Costa Rica", slug: "costa-rica", region: "Central America", popular: true },
  { name: "Guatemala", slug: "guatemala", region: "Central America" },
  { name: "Panama", slug: "panama", region: "Central America" },
  { name: "Argentina", slug: "argentina", region: "South America" },
  { name: "Brazil", slug: "brazil", region: "South America" },
  { name: "Chile", slug: "chile", region: "South America" },
  { name: "Colombia", slug: "colombia", region: "South America" },
  { name: "Ecuador", slug: "ecuador", region: "South America" },
  { name: "Uruguay", slug: "uruguay", region: "South America" },
  { name: "Japan", slug: "japan", region: "Asia" },
  { name: "Malaysia", slug: "malaysia", region: "Asia" },
  { name: "Singapore", slug: "singapore", region: "Asia" },
  { name: "Thailand", slug: "thailand", region: "Asia", popular: true },
  { name: "Australia", slug: "australia", region: "Oceania" },
  { name: "New Zealand", slug: "new-zealand", region: "Oceania" },
];

export const REGION_ORDER: Region[] = [
  "Europe",
  "North America",
  "Central America",
  "South America",
  "Asia",
  "Oceania",
];

export function sortCountriesAlpha(a: Country, b: Country) {
  return a.name.localeCompare(b.name);
}

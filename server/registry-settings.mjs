import { registryDescription } from "../site/celebration.mjs";
// Public registry destinations, approved for anonymous visitors. These are
// the defaults until the family saves the event settings; the live
// description and link are changed in Admin → Website & event (the live link
// differs from this one on purpose: keep it).
export const registryDefaults = [
  {
    id: "target",
    name: "Target",
    description: registryDescription,
    url: "https://www.target.com/gift-registry/gift/quincenera",
    logo: "/assets/target.svg",
  },
];

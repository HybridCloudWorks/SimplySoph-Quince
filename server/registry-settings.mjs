// Registry destinations are returned only through the permission-checked guest API.
// Keep this module out of the public Hosting bundle.
export const registryDefaults = [
  {
    id: "target",
    name: "Target",
    description: {
      en: "A few wishes for Sophia’s next chapter.",
      es: "Algunos deseos para el próximo capítulo de Sophia.",
    },
    url: "https://www.target.com/gift-registry/gift/quincenera",
    logo: "/assets/target.svg",
  },
];

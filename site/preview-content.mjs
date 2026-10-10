// Example text from the family-approved idea book (Oct 9, 2026). It is built only
// into the private admin preview (dist-preview/, served by /api/admin/preview);
// scripts/check.mjs fails the build if any of it reaches the public site.
// Names, schools, hotels and links here are made up until the family confirms them.
// The API image builds the preview, so changes here show after the API is redeployed.
// To publish real content, put it in `family` in site/content.mjs instead.
export const exampleFamily = {
  bio: {
    en: "Hi, I’m Sophia! I’m a freshman at Example High School, and you’ll usually find me at volleyball practice or in the kitchen baking with my abuela. My faith and my family have carried me through fifteen wonderful years, and I can’t wait to start this next chapter with all of you.",
    es: "¡Hola, soy Sophia! Estoy en noveno grado en Example High School y casi siempre me encuentras en la práctica de voleibol o en la cocina horneando con mi abuela. Mi fe y mi familia me han acompañado durante quince años maravillosos, y estoy feliz de comenzar este nuevo capítulo con ustedes.",
  },
  portrait: null,
  moments: [
    { age: 0, text: { en: "Born in Fort Worth", es: "Nació en Fort Worth" } },
    { age: 1, text: { en: "Baptized at Our Lady of Guadalupe", es: "Bautizada en Nuestra Señora de Guadalupe" } },
    { age: 5, text: { en: "First day of school, pink backpack and all", es: "Primer día de escuela, con mochila rosa y todo" } },
    { age: 8, text: { en: "First Communion", es: "Primera Comunión" } },
    { age: 12, text: { en: "First volleyball tournament", es: "Primer torneo de voleibol" } },
    { age: 15, text: { en: "Mis XV, January 15, 2027", es: "Mis XV, 15 de enero de 2027" } },
  ],
  parentsMessage: {
    en: "Mija, from the day we first held you, you have been our greatest blessing. We have watched you grow into a young woman with a generous heart and a strong faith. As you begin this new chapter, know that we are proud of you, we are always beside you, and we love you more than words can say.",
    es: "Mija, desde el día en que te tuvimos en brazos por primera vez, has sido nuestra mayor bendición. Te hemos visto convertirte en una joven de corazón generoso y fe firme. Al comenzar este nuevo capítulo, recuerda que estamos orgullosos de ti, que siempre estaremos a tu lado y que te amamos más de lo que las palabras pueden decir.",
  },
  parentsSignature: { en: "Mom & Dad", es: "Mamá y Papá" },
  court: [
    { name: "Andrés G.", role: "escort", line: { en: "Sophia’s escort for the night, friends since kindergarten", es: "Su chambelán de honor, amigos desde el kínder" } },
    { name: "Camila R.", role: "dama", pair: 1, line: { en: "Cousin and first best friend", es: "Prima y primera mejor amiga" } },
    { name: "Diego L.", role: "chambelan", pair: 1, line: { en: "Youth group", es: "Grupo de jóvenes" } },
    { name: "Valeria M.", role: "dama", pair: 2, line: { en: "Volleyball teammate", es: "Compañera de voleibol" } },
    { name: "Mateo S.", role: "chambelan", pair: 2, line: { en: "Neighbor since age six", es: "Vecino desde los seis años" } },
    { name: "Lucía P.", role: "dama", pair: 3, line: { en: "Choir partner", es: "Compañera del coro" } },
    { name: "Santiago R.", role: "chambelan", pair: 3, line: { en: "Cousin", es: "Primo" } },
  ],
  padrinos: ["misa", "vestido", "corona", "zapatos", "medalla", "biblia", "anillo", "cojin", "ramo", "muneca", "pastel", "brindis"].map(
    (gift) => ({ gift, names: "The Example Family" }),
  ),
  registry: [],
  hotels: [
    {
      name: "Example Hotel North",
      where: { en: "Near the church", es: "Cerca de la iglesia" },
      notes: {
        en: "5 minutes to Our Lady of Guadalupe. Mention SOPHIA XV for the family rate by December 15, 2026.",
        es: "A 5 minutos de Nuestra Señora de Guadalupe. Menciona SOPHIA XV para la tarifa de la familia antes del 15 de diciembre de 2026.",
      },
      url: "https://example.com/",
    },
    {
      name: "Example Inn Azle Ave",
      where: { en: "Near the reception", es: "Cerca de la recepción" },
      notes: {
        en: "8 minutes to The AMZ Event Center. Free breakfast and parking.",
        es: "A 8 minutos de The AMZ Event Center. Desayuno y estacionamiento gratis.",
      },
      url: "https://example.com/",
    },
  ],
  airport: {
    name: "DFW International",
    notes: {
      en: "The closest major airport to Fort Worth. Rideshare and rental cars are easy from there.",
      es: "El aeropuerto principal más cercano a Fort Worth. Desde ahí es fácil tomar un taxi de aplicación o rentar un auto.",
    },
  },
  driveMinutes: 15,
  portraits: [
    { album: "childhood", age: 3, caption: { en: "Age 3, first trip to the beach", es: "A los 3 años, su primer viaje a la playa" } },
    { album: "childhood", age: 5, caption: { en: "First day of kindergarten", es: "Primer día de kínder" } },
    { album: "faith", age: 8, caption: { en: "First Communion, May 2020", es: "Primera Comunión, mayo de 2020" } },
  ],
  churchAddress: null,
  churchName: null,
  churchNotes: null,
  dressCode: {
    en: "Formal evening attire: suits and ties, long gowns or cocktail dresses. For the ceremony, please cover your shoulders or bring a wrap.",
    es: "Vestimenta formal de noche: traje y corbata, vestido largo o de cóctel. Para la ceremonia, por favor cubre tus hombros o lleva un chal.",
  },
  parking: {
    en: "Free parking is available in the church lot and behind The AMZ Event Center.",
    es: "Hay estacionamiento gratis en la iglesia y detrás de The AMZ Event Center.",
  },
  children: {
    en: "Children named on your invitation are welcome. There will be a kids’ table at dinner.",
    es: "Los niños incluidos en tu invitación son bienvenidos. Habrá una mesa para niños en la cena.",
  },
  highlightVideo: "https://example.com/highlights",
  thanksNote: {
    en: "Thank you for celebrating with me! Seeing all of you on January 15th meant the world to me. I’ll keep every dance, every hug and every prayer with me always.",
    es: "¡Gracias por celebrar conmigo! Verlos a todos el 15 de enero significó muchísimo para mí. Guardaré cada baile, cada abrazo y cada oración para siempre.",
  },
};
// The pages that show family content; each one gets a preview.
export const previewRoutes = ["sophia", "court", "padrinos", "travel", "faq", "gallery", "thank-you"];
// Made-up details that must never appear on the public site (checked by
// scripts/check.mjs). Generic wording the family may adopt is deliberately not here.
export const exampleMarkers = [
  "Example High School",
  "Andrés G.",
  "The Example Family",
  "Example Hotel North",
  "Example Inn Azle Ave",
  "example.com",
  "first trip to the beach",
  "First Communion, May 2020",
];

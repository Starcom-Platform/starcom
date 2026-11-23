/**
 * A place's name as it reads mid-sentence: "the United Kingdom", "the
 * Philippines", "the Bahamas", but "France" and "Ohio". Natural Earth names
 * places as a list does, and a card that says "About United States of America
 * as a whole" reads as a fault.
 */
const TAKES_THE = new Set([
  'Comoros', 'Gambia', 'Isle of Man', 'Maldives', 'Netherlands', 'Philippines', 'Seychelles', 'Siachen Glacier',
  'Vatican', 'Western Sahara',
]);
const THE_BY_FORM = /^(United |Republic of |Democratic Republic |Federated States |Central African Republic|Dominican Republic|British |French Southern|South Georgia|Heard Island)|(Islands|Territory|Territories)$/;

export function nameInText(name: string): string {
  if (name.startsWith('The ')) return `the ${name.slice(4)}`;
  return TAKES_THE.has(name) || THE_BY_FORM.test(name) ? `the ${name}` : name;
}

// Fallback only. The country dropdown is filled from /api/holidays/countries,
// which serves all 204 countries the upstream knows about; this shortlist is
// what it shows when that call fails, so a first-run user with no cached list
// still gets a usable picker instead of an empty select.
export const FALLBACK_HOLIDAY_COUNTRIES = [
  { code: 'DE', name: 'Germany' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'PL', name: 'Poland' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
];

// Stays hardcoded: the upstream API exposes subdivision *codes* on each holiday
// but never their names, and these three countries are the only ones where the
// holidays actually differ by region enough to be worth picking.
export const HOLIDAY_SUBDIVISIONS = {
  DE: [
    ['DE-BW', 'Baden-Württemberg'], ['DE-BY', 'Bavaria'], ['DE-BE', 'Berlin'],
    ['DE-BB', 'Brandenburg'], ['DE-HB', 'Bremen'], ['DE-HH', 'Hamburg'],
    ['DE-HE', 'Hesse'], ['DE-MV', 'Mecklenburg-Vorpommern'], ['DE-NI', 'Lower Saxony'],
    ['DE-NW', 'North Rhine-Westphalia'], ['DE-RP', 'Rhineland-Palatinate'],
    ['DE-SL', 'Saarland'], ['DE-SN', 'Saxony'], ['DE-ST', 'Saxony-Anhalt'],
    ['DE-SH', 'Schleswig-Holstein'], ['DE-TH', 'Thuringia'],
  ],
  AT: [
    ['AT-1', 'Burgenland'], ['AT-2', 'Carinthia'], ['AT-3', 'Lower Austria'],
    ['AT-4', 'Upper Austria'], ['AT-5', 'Salzburg'], ['AT-6', 'Styria'],
    ['AT-7', 'Tyrol'], ['AT-8', 'Vorarlberg'], ['AT-9', 'Vienna'],
  ],
  GB: [['GB-ENG', 'England'], ['GB-SCT', 'Scotland'], ['GB-WLS', 'Wales'], ['GB-NIR', 'Northern Ireland']],
};

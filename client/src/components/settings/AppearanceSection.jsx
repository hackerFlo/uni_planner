import { useEffect, useState } from 'react';
import { usePreferences } from '../../context/PreferencesContext';
import { THEMES, DENSITIES } from '../../utils/preferences';
import { api } from '../../api/client';
import { FALLBACK_HOLIDAY_COUNTRIES, HOLIDAY_SUBDIVISIONS } from '../../constants/regions';

const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
const DENSITY_LABELS = { comfortable: 'Comfortable', compact: 'Compact' };

// A country the live list does not contain would silently drop out of the
// select while the stored preference still names it, so the dropdown would show
// the wrong country. Keep it as its own bare-code entry instead.
function withSelected(countries, code) {
  return countries.some(c => c.code === code) ? countries : [...countries, { code, name: code }];
}

// The server proxies and caches the upstream list, so this is a same-origin call
// (AR-10) that normally answers from SQLite. The built-in shortlist covers the
// one case it cannot: a brand-new deployment whose cache is still empty and
// whose upstream is unreachable.
function useHolidayCountries(selectedCode) {
  const [countries, setCountries] = useState(FALLBACK_HOLIDAY_COUNTRIES);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/holidays/countries')
      .then(({ countries: list }) => {
        if (cancelled || !Array.isArray(list) || list.length === 0) return;
        setCountries(list
          .map(c => ({ code: c.countryCode, name: c.name }))
          .sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(err => console.warn('[holidays] country list failed, using the built-in shortlist:', err.message));
    return () => { cancelled = true; };
  }, []);

  return withSelected(countries, selectedCode);
}

function SegmentedControl({ label, options, value, labels, onChange, name }) {
  return (
    <fieldset>
      <legend className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1.5">{label}</legend>
      <div className="flex gap-1 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {options.map(option => (
          <label
            key={option}
            className={`flex-1 text-center text-xs py-1.5 rounded-md cursor-pointer transition ${
              value === option
                ? 'bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 shadow-sm font-medium'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={value === option}
              onChange={() => onChange(option)}
            />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function AppearanceSection() {
  const { preferences, update } = usePreferences();
  const countries = useHolidayCountries(preferences.holidayCountry);
  const subdivisions = HOLIDAY_SUBDIVISIONS[preferences.holidayCountry] ?? [];

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Appearance</h3>

      <SegmentedControl
        label="Theme"
        name="theme"
        options={THEMES}
        labels={THEME_LABELS}
        value={preferences.theme}
        onChange={theme => update({ theme })}
      />

      <SegmentedControl
        label="Card density"
        name="density"
        options={DENSITIES}
        labels={DENSITY_LABELS}
        value={preferences.density}
        onChange={density => update({ density })}
      />

      <label className="flex items-center gap-3 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={preferences.reduceMotion}
            onChange={e => update({ reduceMotion: e.target.checked })}
          />
          <div className={`w-9 h-5 rounded-full transition-colors ${preferences.reduceMotion ? 'bg-indigo-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${preferences.reduceMotion ? 'translate-x-4' : ''}`} />
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-300">Reduce motion</span>
      </label>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed -mt-1">
        Turns off card animations and transitions. Your system setting is always respected as well.
      </p>

      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3">
        <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-widest">Public holidays</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={preferences.showHolidays}
              onChange={e => update({ showHolidays: e.target.checked })}
            />
            <div className={`w-9 h-5 rounded-full transition-colors ${preferences.showHolidays ? 'bg-indigo-500' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${preferences.showHolidays ? 'translate-x-4' : ''}`} />
          </div>
          <span className="text-xs text-zinc-600 dark:text-zinc-300">Show holidays on the planner</span>
        </label>

        <div className={preferences.showHolidays ? 'space-y-3' : 'space-y-3 opacity-40 pointer-events-none'}>
          <div>
            <label htmlFor="holiday-country" className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Country</label>
            <select
              id="holiday-country"
              value={preferences.holidayCountry}
              // Changing country invalidates the region: DE-BY is meaningless in Austria.
              onChange={e => update({ holidayCountry: e.target.value, holidaySubdivision: '' })}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
            >
              {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>

          {subdivisions.length > 0 && (
            <div>
              <label htmlFor="holiday-region" className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Region</label>
              <select
                id="holiday-region"
                value={preferences.holidaySubdivision ?? ''}
                onChange={e => update({ holidaySubdivision: e.target.value })}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
              >
                <option value="">Whole country</option>
                {subdivisions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                Regional holidays only show for the region you pick. Nationwide ones always show.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

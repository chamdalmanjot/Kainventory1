// Maps each cuisine to a country flag file (public/images/flags/) or a fallback emoji.
const CUISINE_FLAGS = {
  filipino:      { code: 'ph' },
  indian:        { code: 'in' },
  italian:       { code: 'it' },
  japanese:      { code: 'jp' },
  chinese:       { code: 'cn' },
  american:      { code: 'us' },
  korean:        { code: 'kr' },
  mexican:       { code: 'mx' },
  mediterranean: { icon: '🥙' },
  seafood:       { icon: '🦐' },
  vegetarian:    { icon: '🥗' },
  cafe:          { icon: '☕' }
};

// Returns HTML for a cuisine's flag or icon. Unknown cuisines get a plate.
function cuisineIcon(cuisine) {
  const meta = CUISINE_FLAGS[String(cuisine).trim().toLowerCase()];
  if (meta && meta.code) {
    return `<img class="flag" src="images/flags/${meta.code}.svg" alt="" width="20" height="15">`;
  }
  return `<span class="flag-emoji" aria-hidden="true">${(meta && meta.icon) || '🍽️'}</span>`;
}
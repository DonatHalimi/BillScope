const CATEGORY_RULES = [
  ['Groceries', /\b(grocery|groceries|supermarket|market|bakery|butcher|spar|lidl|aldi|conad|maxi|meridian|viva fresh)\b/i],
  ['Restaurants', /\b(restaurant|cafe|coffee|espresso|pizza|burger|takeaway|delivery|mcdonald|kfc|subway|glovo|wolt)\b/i],
  ['Transport', /\b(fuel|gas station|petrol|diesel|taxi|uber|bolt|bus|train|parking|toll|car wash)\b/i],
  ['Utilities', /\b(electricity|water bill|heating|internet|broadband|mobile bill|telecom|phone bill|energy)\b/i],
  ['Housing', /\b(rent|mortgage|property management|maintenance fee)\b/i],
  ['Subscriptions', /\b(netflix|spotify|youtube premium|disney\+|prime video|icloud|google one|subscription|membership)\b/i],
  ['Health', /\b(pharmacy|pharm|doctor|clinic|hospital|dental|dentist|medical|health)\b/i],
  ['Shopping', /\b(clothing|clothes|fashion|electronics|online store|amazon|aliexpress|mall|retail|shop)\b/i],
  ['Entertainment', /\b(cinema|movie|theatre|concert|museum|game|gaming|steam|playstation|xbox)\b/i],
  ['Travel', /\b(hotel|airbnb|airline|flight|booking\.com|travel|hostel|airport)\b/i],
  ['Salary', /\b(salary|payroll|wages|monthly pay|employer)\b/i],
  ['Savings', /\b(savings|round.?up|investment|brokerage)\b/i]
];

export function suggestCategory(input = '') {
  const normalized = String(input).normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!normalized) return { category: 'Uncategorised', confidence: 0, matchedRule: null };
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(normalized)) {
      return { category, confidence: 0.86, matchedRule: pattern.source };
    }
  }
  return { category: 'Uncategorised', confidence: 0.15, matchedRule: null };
}

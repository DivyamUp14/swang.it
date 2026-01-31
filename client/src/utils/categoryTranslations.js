// Category translations from English to Italian
export const categoryTranslations = {
  // Coaching categories
  'Life Coaching': 'Life Coaching',
  'Love / Relationship Coaching': 'Coaching Amore / Relazioni',
  'Career Coaching': 'Coaching Carriera',
  'Business / Executive Coaching': 'Coaching Aziendale / Executive',
  'Mindset & Personal Growth': 'Mentalità e Crescita Personale',
  'Self-Esteem & Emotional Wellbeing': 'Autostima e Benessere Emotivo',
  'Anxiety & Stress Management': 'Gestione Ansia e Stress',
  'Parenting / Family Coaching': 'Coaching Genitoriale / Famiglia',
  'Teen / Student Coaching': 'Coaching Adolescenti / Studenti',
  'Psychology (Licensed Professional)': 'Psicologia (Professionista Abilitato)',
  'Psychotherapy (Accredited)': 'Psicoterapia (Accreditata)',
  'Psychiatry (Medical License)': 'Psichiatria (Licenza Medica)',
  'Mindfulness & Relaxation Techniques': 'Mindfulness e Tecniche di Rilassamento',
  'Nutrition / Healthy Habits (Counseling)': 'Nutrizione / Abitudini Sane (Consulenza)',
  'Motivation & Habits': 'Motivazione e Abitudini',
  'Communication & Assertiveness': 'Comunicazione e Assertività',
  'Image Coaching / Style & Personal Branding': 'Coaching Immagine / Stile e Personal Branding',
  'Spiritual Coaching': 'Coaching Spirituale',
  'Trauma Healing / Emotional Release': 'Guarigione Traumi / Rilascio Emotivo',
  'Holistic / Energy Coaching': 'Coaching Olistico / Energetico',
  'Sleep & Relaxation Coaching': 'Coaching Sonno e Rilassamento',
  
  // Cartomancy categories
  'Tarot (Marseille / RWS / Thoth)': 'Tarocchi (Marsiglia / RWS / Thoth)',
  'Sibyls': 'Sibille',
  'Lenormand': 'Lenormand',
  'Oracles': 'Oracoli',
  'Love Cartomancy': 'Cartomanzia dell\'Amore',
  'Career Cartomancy': 'Cartomanzia della Carriera',
  'Money / Finance Cartomancy': 'Cartomanzia Denaro / Finanze',
  'General Cartomancy / Open Questions': 'Cartomanzia Generale / Domande Aperte',
  'Natal Astrology (Birth Chart)': 'Astrologia Natale (Tema Natale)',
  'Astrology: Transits & Forecasts': 'Astrologia: Transiti e Previsioni',
  'Evolutionary Astrology': 'Astrologia Evolutiva',
  'Karmic Astrology': 'Astrologia Karmica',
  'Medical / Holistic Astrology': 'Astrologia Medica / Olistica',
  'Synastry (Couple Compatibility)': 'Sinastria (Compatibilità di Coppia)',
  'Numerology': 'Numerologia',
  'Pendulum / Radiesthesia': 'Pendolo / Radioestesia',
  'Runes': 'Rune',
  'I Ching': 'I Ching',
  'Mediumship / Channeling': 'Medianità / Channeling',
  'Clairvoyance / Spiritual Intuition': 'Chiaroveggenza / Intuizione Spirituale'
};

export const translateCategory = (categoryName) => {
  return categoryTranslations[categoryName] || categoryName;
};

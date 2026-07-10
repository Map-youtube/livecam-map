// ─────────────────────────────────────────────────────────────
// 대륙명 다국어 사전 (7개 대륙 × 지원 언어)
//
// getContinentLabel(continentKey, locale): 대륙 코드를 현재 언어 라벨로.
//   폴백: 현재 언어 없음 → 영어 → 원본 키.
// 대륙 키: asia | europe | north_america | south_america | africa | oceania | middleeast
// ─────────────────────────────────────────────────────────────

export const continentLabels = {
  en: {
    asia: "Asia",
    europe: "Europe",
    north_america: "North America",
    south_america: "South America",
    africa: "Africa",
    oceania: "Oceania",
    middleeast: "Middle East",
  },
  ko: {
    asia: "아시아",
    europe: "유럽",
    north_america: "북아메리카",
    south_america: "남아메리카",
    africa: "아프리카",
    oceania: "오세아니아",
    middleeast: "중동",
  },
  ja: {
    asia: "アジア",
    europe: "ヨーロッパ",
    north_america: "北アメリカ",
    south_america: "南アメリカ",
    africa: "アフリカ",
    oceania: "オセアニア",
    middleeast: "中東",
  },
  zh: {
    asia: "亚洲",
    europe: "欧洲",
    north_america: "北美洲",
    south_america: "南美洲",
    africa: "非洲",
    oceania: "大洋洲",
    middleeast: "中东",
  },
  es: {
    asia: "Asia",
    europe: "Europa",
    north_america: "América del Norte",
    south_america: "América del Sur",
    africa: "África",
    oceania: "Oceanía",
    middleeast: "Oriente Medio",
  },
  fr: {
    asia: "Asie",
    europe: "Europe",
    north_america: "Amérique du Nord",
    south_america: "Amérique du Sud",
    africa: "Afrique",
    oceania: "Océanie",
    middleeast: "Moyen-Orient",
  },
  de: {
    asia: "Asien",
    europe: "Europa",
    north_america: "Nordamerika",
    south_america: "Südamerika",
    africa: "Afrika",
    oceania: "Ozeanien",
    middleeast: "Naher Osten",
  },
  it: {
    asia: "Asia",
    europe: "Europa",
    north_america: "America del Nord",
    south_america: "America del Sud",
    africa: "Africa",
    oceania: "Oceania",
    middleeast: "Medio Oriente",
  },
  pt: {
    asia: "Ásia",
    europe: "Europa",
    north_america: "América do Norte",
    south_america: "América do Sul",
    africa: "África",
    oceania: "Oceania",
    middleeast: "Oriente Médio",
  },
  ru: {
    asia: "Азия",
    europe: "Европа",
    north_america: "Северная Америка",
    south_america: "Южная Америка",
    africa: "Африка",
    oceania: "Океания",
    middleeast: "Ближний Восток",
  },
  hi: {
    asia: "एशिया",
    europe: "यूरोप",
    north_america: "उत्तर अमेरिका",
    south_america: "दक्षिण अमेरिका",
    africa: "अफ्रीका",
    oceania: "ओशिनिया",
    middleeast: "मध्य पूर्व",
  },
  bn: {
    asia: "এশিয়া",
    europe: "ইউরোপ",
    north_america: "উত্তর আমেরিকা",
    south_america: "দক্ষিণ আমেরিকা",
    africa: "আফ্রিকা",
    oceania: "ওশেনিয়া",
    middleeast: "মধ্যপ্রাচ্য",
  },
  th: {
    asia: "เอเชีย",
    europe: "ยุโรป",
    north_america: "อเมริกาเหนือ",
    south_america: "อเมริกาใต้",
    africa: "แอฟริกา",
    oceania: "โอเชียเนีย",
    middleeast: "ตะวันออกกลาง",
  },
  vi: {
    asia: "Châu Á",
    europe: "Châu Âu",
    north_america: "Bắc Mỹ",
    south_america: "Nam Mỹ",
    africa: "Châu Phi",
    oceania: "Châu Đại Dương",
    middleeast: "Trung Đông",
  },
  id: {
    asia: "Asia",
    europe: "Eropa",
    north_america: "Amerika Utara",
    south_america: "Amerika Selatan",
    africa: "Afrika",
    oceania: "Oseania",
    middleeast: "Timur Tengah",
  },
  ar: {
    asia: "آسيا",
    europe: "أوروبا",
    north_america: "أمريكا الشمالية",
    south_america: "أمريكا الجنوبية",
    africa: "أفريقيا",
    oceania: "أوقيانوسيا",
    middleeast: "الشرق الأوسط",
  },
  fa: {
    asia: "آسیا",
    europe: "اروپا",
    north_america: "آمریکای شمالی",
    south_america: "آمریکای جنوبی",
    africa: "آفریقا",
    oceania: "اقیانوسیه",
    middleeast: "خاورمیانه",
  },
};

// 대륙 코드 → 현재 언어 라벨 (폴백: en → 키 자체)
export function getContinentLabel(continentKey, locale) {
  try {
    if (!continentKey) return "";
    const byLocale = continentLabels[locale] || continentLabels.en;
    return (
      byLocale[continentKey] ||
      continentLabels.en[continentKey] ||
      continentKey
    );
  } catch (error) {
    console.error("[i18n] 대륙 라벨 조회 실패:", error); // TODO: 배포 전 제거
    return continentKey;
  }
}

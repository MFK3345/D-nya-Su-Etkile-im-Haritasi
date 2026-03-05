// ========================================
// ÇOK KAYNAKLI VERİ TOPLAMA - OPTİMİZE EDİLMİŞ
// ========================================

// API CACHE - Aynı ülkeyi tekrar çekme
const apiCache = new Map();
const CACHE_DURATION = 3600000; // 1 saat

// Ülke isimlerini İngilizce'ye çevir
const countryNameToEnglish = {
  'Türkiye': 'Turkey', 'Amerika Birleşik Devletleri': 'United States',
  'Brezilya': 'Brazil', 'İspanya': 'Spain', 'Fransa': 'France',
  'Almanya': 'Germany', 'İtalya': 'Italy', 'Japonya': 'Japan',
  'Çin': 'China', 'Hindistan': 'India', 'Rusya': 'Russia',
  'Kanada': 'Canada', 'Avustralya': 'Australia', 'Meksika': 'Mexico',
  'Arjantin': 'Argentina', 'Güney Afrika': 'South Africa',
  'Mısır': 'Egypt', 'Suudi Arabistan': 'Saudi Arabia',
  'Birleşik Krallık': 'United Kingdom', 'Portekiz': 'Portugal'
};

// ========================================
// ANA VERI TOPLAMA (HIZLI VERSİYON)
// ========================================

async function fetchCountryDataFromWeb(countryName, iso2) {
  console.log(`🌐 İnternet verisi: ${countryName}`);
  
  // Cache kontrolü
  const cacheKey = `web_${iso2}`;
  const cached = apiCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    console.log(`⚡ API Cache'den: ${iso2}`);
    updatePanelWithWebData(cached.data, iso2);
    return;
  }
  
  showLoadingPanel(countryName, iso2);
  
  try {
    const englishName = countryNameToEnglish[countryName] || countryName;
    
    // SADECE 2 KAYNAK (daha hızlı)
    const [restcountriesData, worldbankData] = await Promise.allSettled([
      fetchFromRestcountries(iso2),
      fetchFromWorldBank(iso2)
    ]);
    
    const combinedData = combineDataSources(
      restcountriesData.value,
      worldbankData.value,
      countryName,
      iso2
    );
    
    // Cache'e kaydet
    apiCache.set(cacheKey, {
      data: combinedData,
      timestamp: Date.now()
    });
    
    updatePanelWithWebData(combinedData, iso2);
    
  } catch (error) {
    console.error('❌ Veri hatası:', error);
    showWebDataError(countryName);
  }
}

// ========================================
// 1. RESTCOUNTRIES API (TİMEOUT EKLENDİ)
// ========================================

async function fetchFromRestcountries(iso2) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 saniye timeout
    
    const response = await fetch(`https://restcountries.com/v3.1/alpha/${iso2}`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error('RestCountries hatası');
    
    const data = await response.json();
    const country = data[0];
    
    console.log('✅ RestCountries');
    
    return {
      name: country.translations?.tur?.common || country.name.common,
      population: country.population,
      capital: country.capital?.[0]
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('⏱️ RestCountries timeout');
    } else {
      console.warn('⚠️ RestCountries:', error.message);
    }
    return null;
  }
}

// ========================================
// 2. WORLD BANK API (TİMEOUT + OPTİMİZE)
// ========================================

async function fetchFromWorldBank(iso2) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    // Sadece GSYİH al (su verisi genelde boş geliyor)
    const gdpUrl = `https://api.worldbank.org/v2/country/${iso2}/indicator/NY.GDP.MKTP.CD?format=json&date=2023&per_page=1`;
    const response = await fetch(gdpUrl, { signal: controller.signal });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error('World Bank hatası');
    
    const data = await response.json();
    const gdpValue = data[1]?.[0]?.value;
    
    console.log('✅ World Bank');
    
    return {
      gdp: gdpValue
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('⏱️ World Bank timeout');
    } else {
      console.warn('⚠️ World Bank:', error.message);
    }
    return null;
  }
}

// ========================================
// VERİLERİ BİRLEŞTİR (BASİTLEŞTİRİLDİ)
// ========================================

function combineDataSources(restcountries, worldbank, turkishName, iso2) {
  const population = restcountries?.population || null;
  const gdp = worldbank?.gdp || null;
  
  const waterScore = calculateWaterScore(iso2);
  
  const sources = [
    restcountries && 'RestCountries',
    worldbank && 'World Bank'
  ].filter(Boolean).join(', ') || 'Yerel Tahmin';
  
  return {
    name: turkishName,
    population: population,
    gdp: gdp,
    waterScore: waterScore,
    info: {
      genel: getGeneralInfo(turkishName, iso2),
      sorunlar: getWaterProblems(iso2),
      cozumler: getWaterSolutions(iso2)
    },
    sources: sources
  };
}

// ========================================
// HIZLI BİLGİ ÜRETİMİ
// ========================================

function getGeneralInfo(countryName, iso2) {
  const infos = {
    'tr': `${countryName}, su kaynakları açısından orta düzeyde bir ülkedir. Yıllık ortalama yağış 643 mm olup, kişi başına düşen su miktarı 1.346 m³/yıl'dır.`,
    'us': `${countryName}, zengin tatlı su kaynaklarına sahiptir. Büyük Göller ve Mississippi Nehri önemli kaynaklardır.`,
    'br': `${countryName}, Amazon Havzası ile dünyanın en zengin tatlı su kaynaklarına sahip ülkelerden biridir.`,
    'es': `${countryName}, Akdeniz iklimi nedeniyle su kaynakları sınırlı bir ülkedir. Yağış dağılımı dengesizdir.`,
    'eg': `${countryName}, su kaynaklarının neredeyse tamamını Nil Nehri'nden sağlamaktadır.`,
  };
  
  return infos[iso2] || `${countryName} hakkında su kaynakları bilgisi mevcut değildir.`;
}

function calculateWaterScore(iso2) {
  const scores = {
    'br': 9, 'ca': 9, 'ru': 9, 'no': 9, 'is': 9,
    'us': 8, 'se': 8, 'fi': 8, 'nz': 8,
    'tr': 6, 'fr': 7, 'de': 7, 'gb': 7, 'es': 5, 'it': 6,
    'eg': 3, 'sa': 2, 'ae': 2, 'jo': 3, 'ly': 2, 'ye': 2
  };
  
  return scores[iso2] || 5;
}

function getWaterProblems(iso2) {
  const problems = {
    'tr': 'İklim değişikliği ve düzensiz yağışlar su stresine neden olmaktadır.',
    'eg': 'Nil Nehri\'nin debisi azalmakta, nüfus artışı su kıtlığını artırmaktadır.',
    'sa': 'Çöl iklimi ve yeraltı sularının tükenmesi ciddi su krizine yol açmaktadır.',
    'br': 'Amazon havzasında orman tahribatı su döngüsünü bozmaktadır.',
    'es': 'Akdeniz havzasında kuraklık ve turizm su kaynaklarına baskı oluşturmaktadır.'
  };
  
  return problems[iso2] || 'İklim değişikliği ve nüfus artışı su kaynaklarına baskı yapmaktadır.';
}

function getWaterSolutions(iso2) {
  const solutions = {
    'tr': 'GAP projeleri, damlama sulama ve baraj yatırımları yapılmaktadır.',
    'eg': 'Tuzdan arındırma ve su tasarrufu kampanyaları uygulanmaktadır.',
    'sa': 'Büyük ölçekli tuzdan arındırma tesisleri kurulmaktadır.',
    'br': 'Amazon ormanlarının korunması ve nehir havza yönetimi uygulanmaktadır.',
    'es': 'Damlama sulama ve tuzdan arındırma yaygınlaşmaktadır.'
  };
  
  return solutions[iso2] || 'Modern sulama teknikleri ve su arıtma tesisleri uygulanmaktadır.';
}

// ========================================
// PANEL GÜNCELLEMELERİ
// ========================================

function showLoadingPanel(countryName, iso2) {
  const infoPanel = document.getElementById('info');
  if (infoPanel) {
    infoPanel.style.display = 'block';
    document.getElementById('country-name').textContent = countryName;
    document.getElementById('water-text').innerHTML = `
      <div style="text-align:center; padding:20px;">
        <div style="font-size:40px; margin-bottom:10px;">🌐</div>
        <p style="margin:5px 0;"><strong>Veri yükleniyor...</strong></p>
        <p style="font-size:12px; color:#666;">RestCountries • World Bank</p>
      </div>
    `;
    
    const flag = document.getElementById('flag');
    if (iso2) {
      flag.src = `https://flagcdn.com/w40/${iso2}.png`;
      flag.style.display = 'inline-block';
    }
  }
}

function updatePanelWithWebData(data, iso2) {
  document.getElementById('country-name').textContent = data.name;
  document.getElementById('pop').textContent = data.population ? data.population.toLocaleString('tr-TR') : '—';
  document.getElementById('gdp').textContent = data.gdp ? (data.gdp / 1000000000).toFixed(0) + ' Milyar $' : '—';
  document.getElementById('score').textContent = data.waterScore;
  
  let infoHTML = `
    <p style="margin-bottom: 12px; line-height: 1.5;"><strong>📊 Genel Durum:</strong><br>${data.info.genel}</p>
    <p style="margin-bottom: 12px; line-height: 1.5;"><strong>⚠️ Sorunlar:</strong><br>${data.info.sorunlar}</p>
    <p style="margin-bottom: 12px; line-height: 1.5;"><strong>✅ Çözümler:</strong><br>${data.info.cozumler}</p>
    <p style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #666;">
      <strong>📚 Kaynaklar:</strong> ${data.sources}
    </p>
  `;
  
  document.getElementById('water-text').innerHTML = infoHTML;
  
  if (window.renderTemporaryCharts) {
    window.renderTemporaryCharts(data.name);
  }
  
  console.log('✅ Panel güncellendi');
}

function showWebDataError(countryName) {
  document.getElementById('country-name').textContent = countryName;
  document.getElementById('pop').textContent = '—';
  document.getElementById('gdp').textContent = '—';
  document.getElementById('score').textContent = '—';
  
  document.getElementById('water-text').innerHTML = `
    <div style="text-align:center; padding:20px;">
      <p style="font-size:48px; margin:0;">🌐</p>
      <p style="color:#ef4444; font-weight:bold; margin:10px 0;">Bağlantı Hatası</p>
      <p style="color:#666; font-size:14px;">İnternet bağlantınızı kontrol edin.</p>
    </div>
  `;
}

window.fetchCountryDataFromWeb = fetchCountryDataFromWeb;
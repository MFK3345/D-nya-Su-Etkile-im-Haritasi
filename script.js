// ========================================
// 2D SU KAYNAKLARI HARİTASI - OPTİMİZE EDİLMİŞ
// ========================================

// ========================================
// GLOBAL DEĞİŞKENLER
// ========================================

let map = null;
let currentLayer = null;

// CACHE SİSTEMİ - Aynı ülkeye tekrar tıklanırsa veriyi tekrar çekme
const dataCache = new Map();

// SU SKORU VERİ DEPOSU (API'den gelecek)
const waterScoreData = new Map();

// RENK PALETİ - Su Rezervi Skoru (0-10)
const waterColorScale = {
  0: '#8B0000',  // Çok Kötü - Koyu Kırmızı
  1: '#B22222',  // Kötü - Kırmızı
  2: '#DC143C',  // Zayıf - Crimson
  3: '#FF6347',  // Yetersiz - Domates
  4: '#FFA500',  // Düşük - Turuncu
  5: '#FFD700',  // Orta - Altın
  6: '#ADFF2F',  // İyi - Yeşil Sarı
  7: '#7FFF00',  // Çok İyi - Chartreuse
  8: '#32CD32',  // Mükemmel - Lime Yeşil
  9: '#228B22',  // Zengin - Orman Yeşili
  10: '#006400'  // Bolluk - Koyu Yeşil
};

function getColorByWaterScore(score) {
  if (score === null || score === undefined) return '#cccccc'; // Veri yok
  const rounded = Math.round(Math.max(0, Math.min(10, score)));
  return waterColorScale[rounded];
}

// ========================================
// API VERİ ÇEKME FONKSİYONLARI
// ========================================

// World Bank API - Su kaynakları verisi (2025'e kadar)
async function fetchWorldBankWaterData(iso2) {
  try {
    // Yenilenebilir tatlı su kaynakları (m³/kişi/yıl)
    const indicators = [
      'ER.H2O.INTR.PC',  // İç tatlı su kaynakları
      'ER.H2O.FWTL.K3',  // Toplam tatlı su çekimi
      'AG.LND.PRCP.MM'   // Yıllık yağış
    ];
    
    // 2015-2025 arası verileri çek (en son 10 yıl)
    const requests = indicators.map(ind => 
      fetch(`https://api.worldbank.org/v2/country/${iso2}/indicator/${ind}?format=json&per_page=20&date=2015:2025&mrnev=1`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    );
    
    const results = await Promise.all(requests);
    
    const waterData = {};
    results.forEach((result, idx) => {
      if (result && result[1] && result[1].length > 0) {
        // En son tarihli verileri önce sırala
        const sortedData = result[1]
          .filter(d => d.value !== null)
          .sort((a, b) => parseInt(b.date) - parseInt(a.date));
        
        if (sortedData.length > 0) {
          waterData[indicators[idx]] = sortedData;
        }
      }
    });
    
    return waterData;
  } catch (err) {
    console.warn('World Bank API hatası:', err);
    return null;
  }
}

// REST Countries API - Genel ülke bilgisi
async function fetchRestCountriesData(iso2) {
  try {
    const response = await fetch(`https://restcountries.com/v3.1/alpha/${iso2}`);
    if (!response.ok) throw new Error('REST Countries hatası');
    
    const data = await response.json();
    const country = data[0];
    
    return {
      name: country.translations?.tur?.common || country.name.common,
      nameEn: country.name.common,
      population: country.population,
      area: country.area,
      capital: country.capital?.[0],
      region: country.region,
      subregion: country.subregion,
      latlng: country.latlng
    };
  } catch (err) {
    console.warn('REST Countries API hatası:', err);
    return null;
  }
}

// Wikipedia API - Detaylı su kaynakları bilgisi (TÜRKÇE)
async function fetchWikipediaWaterInfo(countryName, countryNameTr) {
  try {
    // Önce Türkçe Wikipedia'da ara
    const searchTerm = `${countryNameTr || countryName} su kaynakları`;
    const searchResponse = await fetch(
      `https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json&origin=*`
    );
    
    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json();
    
    if (searchData.query.search.length === 0) {
      // Türkçe'de yoksa İngilizce'den çeviri yap
      return await fetchEnglishWikipediaAndTranslate(countryName);
    }
    
    const pageId = searchData.query.search[0].pageid;
    const extractResponse = await fetch(
      `https://tr.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&pageids=${pageId}&format=json&origin=*`
    );
    
    if (!extractResponse.ok) return null;
    const extractData = await extractResponse.json();
    
    const extract = extractData.query.pages[pageId]?.extract;
    return extract ? extract.substring(0, 600) : null;
  } catch (err) {
    console.warn('Wikipedia API hatası:', err);
    return null;
  }
}

// İngilizce Wikipedia'dan veri çek (yedek)
async function fetchEnglishWikipediaAndTranslate(countryName) {
  try {
    const searchResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(countryName + ' water resources')}&format=json&origin=*`
    );
    
    if (!searchResponse.ok) return null;
    const searchData = await searchResponse.json();
    
    if (searchData.query.search.length === 0) return null;
    
    const pageId = searchData.query.search[0].pageid;
    const extractResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&pageids=${pageId}&format=json&origin=*`
    );
    
    if (!extractResponse.ok) return null;
    const extractData = await extractResponse.json();
    
    const extract = extractData.query.pages[pageId]?.extract;
    
    // Basit İngilizce-Türkçe çeviri terimleri
    if (extract) {
      let translated = extract;
      const translations = {
        'water resources': 'su kaynakları',
        'renewable water': 'yenilenebilir su',
        'freshwater': 'tatlı su',
        'groundwater': 'yeraltı suyu',
        'surface water': 'yüzey suyu',
        'precipitation': 'yağış',
        'drought': 'kuraklık',
        'irrigation': 'sulama',
        'agriculture': 'tarım',
        'annual': 'yıllık',
        'river': 'nehir',
        'lake': 'göl',
        'basin': 'havza',
        'per capita': 'kişi başına',
        'cubic meters': 'metreküp',
        'billion': 'milyar',
        'million': 'milyon',
        'water stress': 'su stresi',
        'water scarcity': 'su kıtlığı'
      };
      
      for (const [eng, tr] of Object.entries(translations)) {
        translated = translated.replace(new RegExp(eng, 'gi'), tr);
      }
      
      return translated.substring(0, 600);
    }
    
    return null;
  } catch (err) {
    console.warn('İngilizce Wikipedia hatası:', err);
    return null;
  }
}

// FAO AQUASTAT - Su kullanım verileri (2025'e kadar)
async function fetchFAOWaterData(iso2) {
  try {
    // World Bank'tan tarımsal su kullanımı (en son veriler)
    const response = await fetch(
      `https://api.worldbank.org/v2/country/${iso2}/indicator/ER.H2O.FWAG.ZS?format=json&per_page=10&date=2015:2025&mrnev=1`
    );
    
    if (!response.ok) return null;
    const data = await response.json();
    
    if (data[1] && data[1].length > 0) {
      // En son tarihli verileri önce sırala
      const validData = data[1]
        .filter(d => d.value !== null)
        .sort((a, b) => parseInt(b.date) - parseInt(a.date));
      
      return validData.length > 0 ? validData : null;
    }
    
    return null;
  } catch (err) {
    console.warn('FAO veri hatası:', err);
    return null;
  }
}

// SU SKORU HESAPLAMA (0-10 arası)
function calculateWaterScore(wbData, countryData) {
  let score = 5; // Varsayılan orta
  
  try {
    // Kişi başı su kaynağı varsa
    if (wbData && wbData['ER.H2O.INTR.PC']) {
      const latestWater = wbData['ER.H2O.INTR.PC'][0].value;
      
      // 10,000 m³/kişi/yıl = 10 puan
      // 1,000 m³/kişi/yıl = 0 puan (su stresi)
      if (latestWater > 10000) score = 10;
      else if (latestWater > 5000) score = 8;
      else if (latestWater > 2500) score = 6;
      else if (latestWater > 1700) score = 4;
      else if (latestWater > 1000) score = 2;
      else score = 1;
    }
    
    // Yağış miktarı bonus
    if (wbData && wbData['AG.LND.PRCP.MM']) {
      const rainfall = wbData['AG.LND.PRCP.MM'][0].value;
      if (rainfall > 1500) score = Math.min(10, score + 1);
      else if (rainfall < 500) score = Math.max(0, score - 1);
    }
  } catch (err) {
    console.warn('Skor hesaplama hatası:', err);
  }
  
  return Math.round(score);
}

// TÜM VERİLERİ BİRLEŞTİR
async function fetchAllCountryData(iso2, countryName) {
  console.log(`📡 ${countryName} için tüm API'ler sorgulanıyor...`);
  
  const [restCountries, worldBank, fao] = await Promise.all([
    fetchRestCountriesData(iso2),
    fetchWorldBankWaterData(iso2),
    fetchFAOWaterData(iso2)
  ]);
  
  // Wikipedia için hem İngilizce hem Türkçe isim kullan
  const countryNameTr = restCountries?.name || countryName;
  const countryNameEn = restCountries?.nameEn || countryName;
  const wikipedia = await fetchWikipediaWaterInfo(countryNameEn, countryNameTr);
  
  const waterScore = calculateWaterScore(worldBank, restCountries);
  waterScoreData.set(iso2, waterScore);
  
  // Grafik verileri oluştur
  const charts = generateChartData(worldBank, fao);
  
  // Bilgi metinleri oluştur (TÜRKÇE)
  const info = generateWaterInfo(worldBank, restCountries, wikipedia, waterScore, countryNameTr);
  
  return {
    name: countryNameTr,
    nameEn: countryNameEn,
    population: restCountries?.population,
    gdp: null,
    waterScore: waterScore,
    capital: restCountries?.capital,
    area: restCountries?.area,
    info: info,
    charts: charts,
    sources: 'World Bank, REST Countries, Wikipedia (Türkçe), FAO AQUASTAT',
    rawData: {
      worldBank: worldBank,
      restCountries: restCountries,
      fao: fao
    }
  };
}

// GRAFİK VERİLERİ OLUŞTUR (2025 dahil)
function generateChartData(wbData, faoData) {
  const currentYear = 2025; // Şu anki yıl
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 9 + i); // 2016-2025
  
  let reserveValues = [];
  
  // World Bank'tan gerçek veriler varsa kullan
  if (wbData && wbData['ER.H2O.INTR.PC']) {
    const dataPoints = wbData['ER.H2O.INTR.PC'];
    const dataMap = {};
    
    dataPoints.forEach(d => {
      if (d.value !== null && d.date) {
        const year = parseInt(d.date);
        dataMap[year] = d.value / 1000; // m³'ü km³'e çevir (yaklaşık)
      }
    });
    
    reserveValues = years.map(year => dataMap[year] || null);
    
    // Boşlukları doldur (interpolasyon) - daha akıllı
    let lastValid = null;
    let nextValidIdx = -1;
    
    for (let i = 0; i < reserveValues.length; i++) {
      if (reserveValues[i] !== null) {
        lastValid = reserveValues[i];
        continue;
      }
      
      // Sonraki geçerli değeri bul
      if (nextValidIdx < i) {
        nextValidIdx = -1;
        for (let j = i + 1; j < reserveValues.length; j++) {
          if (reserveValues[j] !== null) {
            nextValidIdx = j;
            break;
          }
        }
      }
      
      // İnterpolasyon yap
      if (lastValid !== null && nextValidIdx > i) {
        const nextValid = reserveValues[nextValidIdx];
        const ratio = (i - (i - 1)) / (nextValidIdx - (i - 1));
        reserveValues[i] = lastValid + (nextValid - lastValid) * ratio;
      } else if (lastValid !== null) {
        reserveValues[i] = lastValid; // Son değeri kullan
      }
    }
    
    // Hala null olanları ortalama ile doldur
    const validValues = reserveValues.filter(v => v !== null);
    if (validValues.length > 0) {
      const avg = validValues.reduce((a, b) => a + b, 0) / validValues.length;
      reserveValues = reserveValues.map(v => v === null ? avg : v);
    }
  } else {
    // Veri yoksa geçici veri oluştur
    const base = 50 + Math.random() * 200;
    reserveValues = years.map(() => Math.round(base + (Math.random() - 0.5) * 20));
  }
  
  // Kullanım alanları (FAO verisi yoksa tahmini)
  let usage = [65, 20, 15]; // Tarım, İçme, Sanayi (varsayılan)
  
  if (faoData && faoData.length > 0) {
    // En son veriyi kullan
    const agriPercent = faoData[0].value;
    if (agriPercent !== null) {
      usage = [
        Math.round(agriPercent),
        Math.round((100 - agriPercent) * 0.6),
        Math.round((100 - agriPercent) * 0.4)
      ];
    }
  }
  
  return {
    reserve: { years, values: reserveValues },
    usage: usage
  };
}

// BİLGİ METİNLERİ OLUŞTUR (TAMAMEN TÜRKÇE VE DETAYLI - 2025 VERİLERİ)
function generateWaterInfo(wbData, countryData, wikipedia, score, countryName) {
  let genel = '';
  let sorunlar = '';
  let cozumler = '';
  
  // 📊 GENEL DURUM
  if (countryData) {
    genel += `<strong>${countryName}</strong> `;
    
    if (countryData.capital) {
      genel += `(Başkent: ${countryData.capital}) `;
    }
    
    if (countryData.population) {
      const popMillion = (countryData.population / 1000000).toFixed(1);
      genel += `${popMillion} milyon nüfuslu bir ülke. `;
    }
  }
  
  // SU KAYNAKLARI VERİSİ (EN SON TARİHLİ VERİ)
  if (wbData && wbData['ER.H2O.INTR.PC']) {
    const waterData = wbData['ER.H2O.INTR.PC'];
    const latestWater = waterData[0].value; // İlk eleman en son tarih (sıralı)
    const year = waterData[0].date;
    
    genel += `<br><br><strong>💧 Su Kaynakları (${year} - En Güncel Veri):</strong><br>`;
    genel += `• Kişi başına yıllık <strong>${Math.round(latestWater).toLocaleString('tr-TR')} m³</strong> yenilenebilir tatlı su mevcut.<br>`;
    
    // Su durumu yorumu
    if (latestWater > 10000) {
      genel += `• Su kaynakları açısından <strong style="color: #22c55e;">çok zengin</strong> durumda.<br>`;
      genel += `• Dünya ortalamasının (6,000 m³) üzerinde rezerve sahip.<br>`;
    } else if (latestWater > 5000) {
      genel += `• Su kaynakları <strong style="color: #84cc16;">yeterli</strong> seviyede.<br>`;
      genel += `• Sürdürülebilir kullanımla gelecek güvence altında.<br>`;
    } else if (latestWater > 2500) {
      genel += `• Su kaynakları <strong style="color: #eab308;">orta</strong> düzeyde.<br>`;
      genel += `• Dikkatli yönetim gerekiyor.<br>`;
    } else if (latestWater > 1700) {
      genel += `• <strong style="color: #f97316;">Su stresi</strong> seviyesinde (1,700-2,500 m³).<br>`;
      genel += `• Kuraklık dönemlerinde sıkıntı yaşanabilir.<br>`;
    } else if (latestWater > 1000) {
      genel += `• <strong style="color: #ef4444;">Kronik su kıtlığı</strong> seviyesinde (1,000-1,700 m³).<br>`;
      genel += `• Ciddi su yönetimi önlemleri gerekli.<br>`;
    } else {
      genel += `• <strong style="color: #dc2626;">Mutlak su kıtlığı</strong> yaşanıyor (&lt;1,000 m³).<br>`;
      genel += `• Acil müdahale ve alternatif çözümler şart.<br>`;
    }
    
    // Trend analizi (en az 2 veri noktası varsa)
    if (waterData.length >= 2) {
      const oldValue = waterData[waterData.length - 1].value;
      const oldYear = waterData[waterData.length - 1].date;
      const yearDiff = parseInt(year) - parseInt(oldYear);
      const change = ((latestWater - oldValue) / oldValue * 100).toFixed(1);
      
      if (Math.abs(change) > 1) {
        if (change > 0) {
          genel += `• Son ${yearDiff} yılda <strong style="color: #22c55e;">%${change} artış</strong> görülüyor. ✅<br>`;
        } else {
          genel += `• Son ${yearDiff} yılda <strong style="color: #ef4444;">%${Math.abs(change)} azalma</strong> var. ⚠️<br>`;
        }
      } else {
        genel += `• Son ${yearDiff} yılda değişim minimal (kararlı durum). ➡️<br>`;
      }
    }
  } else {
    genel += `<br><strong>⚠️ Güncel su kaynakları verisi bulunamadı.</strong> `;
  }
  
  // YAĞIŞ BİLGİSİ (EN SON TARİH)
  if (wbData && wbData['AG.LND.PRCP.MM']) {
    const rainfallData = wbData['AG.LND.PRCP.MM'];
    const rainfall = rainfallData[0].value;
    const rainYear = rainfallData[0].date;
    
    genel += `<br><strong>🌧️ İklim (${rainYear}):</strong><br>`;
    genel += `• Yıllık ortalama yağış: <strong>${Math.round(rainfall)} mm</strong><br>`;
    
    if (rainfall > 2000) {
      genel += `• Çok yağışlı bölge (tropikal/ekvatoral iklim)<br>`;
    } else if (rainfall > 1000) {
      genel += `• Yeterli yağış alan bölge (ılıman iklim)<br>`;
    } else if (rainfall > 500) {
      genel += `• Orta düzey yağış alan bölge (step iklimi)<br>`;
    } else {
      genel += `• Kurak bölge (çöl iklimi)<br>`;
    }
  }
  
  // SU ÇEKİMİ (EN SON TARİH)
  if (wbData && wbData['ER.H2O.FWTL.K3']) {
    const withdrawalData = wbData['ER.H2O.FWTL.K3'];
    const withdrawal = withdrawalData[0].value;
    const withdrawYear = withdrawalData[0].date;
    
    genel += `<br><strong>💦 Su Kullanımı (${withdrawYear}):</strong><br>`;
    genel += `• Yıllık toplam su çekimi: <strong>${withdrawal.toFixed(2)} milyar m³</strong><br>`;
    
    if (countryData?.population) {
      const perCapitaUsage = (withdrawal * 1000000000) / countryData.population;
      genel += `• Kişi başına kullanım: <strong>${Math.round(perCapitaUsage)} m³/yıl</strong><br>`;
    }
  }
  
  // WIKIPEDIA BİLGİSİ
  if (wikipedia) {
    genel += `<br><br><strong>📚 Detaylı Bilgi:</strong><br>`;
    genel += wikipedia.substring(0, 400) + '...';
  }
  
  // ⚠️ SORUNLAR (Skora göre)
  if (score <= 2) {
    sorunlar = `• <strong>Mutlak su kıtlığı:</strong> Temel ihtiyaçları karşılamakta zorluk<br>`;
    sorunlar += `• <strong>Çölleşme riski:</strong> Tarım arazilerinin verimsizleşmesi<br>`;
    sorunlar += `• <strong>Altyapı yetersizliği:</strong> Dağıtım ve depolama sistemleri eksik<br>`;
    sorunlar += `• <strong>Kirlilik:</strong> Mevcut kaynakların kullanılabilirliği azalıyor<br>`;
    sorunlar += `• <strong>İklim değişikliği:</strong> Kuraklık sıklığında artış<br>`;
    sorunlar += `• <strong>Nüfus baskısı:</strong> Artan talep ile kaynak yetersizliği`;
  } else if (score <= 4) {
    sorunlar = `• <strong>Su stresi:</strong> Belirli dönemlerde kıtlık yaşanıyor<br>`;
    sorunlar += `• <strong>Tarımsal zorluklar:</strong> Sulama suyunda yetersizlik<br>`;
    sorunlar += `• <strong>Şehirleşme etkisi:</strong> Yeraltı sularında azalma<br>`;
    sorunlar += `• <strong>Su kalitesi:</strong> Kirlilik ve arıtma ihtiyacı<br>`;
    sorunlar += `• <strong>Bölgesel eşitsizlik:</strong> Bazı bölgelerde daha fazla sıkıntı<br>`;
    sorunlar += `• <strong>Kayıp-kaçak:</strong> Dağıtım sistemlerinde verimsizlik`;
  } else if (score <= 6) {
    sorunlar = `• <strong>Mevsimsel değişkenlik:</strong> Yaz aylarında su sıkıntısı<br>`;
    sorunlar += `• <strong>Kalite sorunları:</strong> Bazı kaynaklarda kirliliğe bağlı sorunlar<br>`;
    sorunlar += `• <strong>Altyapı yaşlanması:</strong> Modernizasyon gerekli<br>`;
    sorunlar += `• <strong>Tarımda verimsizlik:</strong> Sulama yöntemleri iyileştirilebilir<br>`;
    sorunlar += `• <strong>İklim belirsizliği:</strong> Yağış rejiminde değişim riski<br>`;
    sorunlar += `• <strong>Yeraltı suyu yönetimi:</strong> Sürdürülebilirlik endişesi`;
  } else {
    sorunlar = `• <strong>Sürdürülebilirlik:</strong> Uzun vadeli koruma planlaması şart<br>`;
    sorunlar += `• <strong>Ekosistem dengesi:</strong> Doğal ortamların su ihtiyacı<br>`;
    sorunlar += `• <strong>İklim adaptasyonu:</strong> Değişen koşullara hazırlık<br>`;
    sorunlar += `• <strong>Kullanım verimliliği:</strong> Israfın önlenmesi<br>`;
    sorunlar += `• <strong>Kirlilik kontrolü:</strong> Kaynakların korunması<br>`;
    sorunlar += `• <strong>Bölgesel denge:</strong> Adil su dağılımı sağlanması`;
  }
  
  // ✅ ÇÖZÜMLER (Skora göre)
  if (score <= 2) {
    cozumler = `• <strong>Tuzdan arındırma tesisleri:</strong> Deniz suyu kullanımı<br>`;
    cozumler += `• <strong>Su ithalatı:</strong> Komşu ülkelerle anlaşmalar<br>`;
    cozumler += `• <strong>Acil tasarruf önlemleri:</strong> Kullanım kısıtlamaları<br>`;
    cozumler += `• <strong>Yağmur suyu hasadı:</strong> Her damlanın değerlendirilmesi<br>`;
    cozumler += `• <strong>Atık su geri kazanımı:</strong> %100 arıtma ve yeniden kullanım<br>`;
    cozumler += `• <strong>Damlama sulama:</strong> Tarımda zorunlu verimli sistemler<br>`;
    cozumler += `• <strong>Yeraltı suyu şarjı:</strong> Yapay besleme projeleri<br>`;
    cozumler += `• <strong>Teknoloji transferi:</strong> İleri su teknolojileri`;
  } else if (score <= 4) {
    cozumler = `• <strong>Baraj ve gölet yapımı:</strong> Depolama kapasitesi artırımı<br>`;
    cozumler += `• <strong>Sulama modernizasyonu:</strong> Damlama ve yağmurlama sistemleri<br>`;
    cozumler += `• <strong>Arıtma tesisleri:</strong> İleri biyolojik arıtma<br>`;
    cozumler += `• <strong>Kayıp-kaçak önleme:</strong> Boru hatlarının yenilenmesi<br>`;
    cozumler += `• <strong>Su fiyatlandırması:</strong> Kademelendirilmiş tarife sistemi<br>`;
    cozumler += `• <strong>Yeraltı suyu yönetimi:</strong> Kontrollü çekim planlaması<br>`;
    cozumler += `• <strong>Farkındalık kampanyaları:</strong> Tasarruf bilinci oluşturma<br>`;
    cozumler += `• <strong>Alternatif kaynaklar:</strong> Yağmur suyu, gri su kullanımı`;
  } else if (score <= 6) {
    cozumler = `• <strong>Entegre havza yönetimi:</strong> Bütüncül planlama<br>`;
    cozumler += `• <strong>Akıllı sulama:</strong> Sensör tabanlı sistemler<br>`;
    cozumler += `• <strong>Su tasarrufu cihazları:</strong> Perlümatör, dual flush vs.<br>`;
    cozumler += `• <strong>Yeşil altyapı:</strong> Geçirgen yüzeyler, yağmur bahçeleri<br>`;
    cozumler += `• <strong>Geri kazanım:</strong> Atık su arıtma ve yeniden kullanım<br>`;
    cozumler += `• <strong>İzleme sistemleri:</strong> Gerçek zamanlı su yönetimi<br>`;
    cozumler += `• <strong>Eğitim programları:</strong> Okullarda su bilinci<br>`;
    cozumler += `• <strong>Teşvik mekanizmaları:</strong> Verimli kullanım ödülleri`;
  } else {
    cozumler = `• <strong>Ekosistem koruma:</strong> Doğal kaynakların sürdürülebilir kullanımı<br>`;
    cozumler += `• <strong>İleri teknoloji:</strong> IoT, yapay zeka ile optimizasyon<br>`;
    cozumler += `• <strong>Döngüsel ekonomi:</strong> Sıfır atık su hedefi<br>`;
    cozumler += `• <strong>Yenilenebilir enerji:</strong> Güneş enerjili pompalama<br>`;
    cozumler += `• <strong>Biyoçeşitlilik:</strong> Sulak alanların korunması<br>`;
    cozumler += `• <strong>Araştırma-geliştirme:</strong> Yeni su teknolojileri<br>`;
    cozumler += `• <strong>Uluslararası işbirliği:</strong> Sınıraşan sular için diyalog<br>`;
    cozumler += `• <strong>İklim direnci:</strong> Değişime adaptasyon stratejileri`;
  }
  
  return { genel, sorunlar, cozumler };
}

// ========================================
// YARDIMCI FONKSİYONLAR
// ========================================

const el = (id) => document.getElementById(id);
const fmtNum = (n) => (typeof n === "number" ? n.toLocaleString("tr-TR") : "—");

// ========================================
// HARİTA BAŞLATMA
// ========================================

function initMap() {
  map = L.map("map").setView([20, 0], 2);
  
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 7,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);
  
  console.log('✅ 2D harita başlatıldı');
}

// ========================================
// ISO KODU BULMA
// ========================================

function getISO2(props) {
  const keys = ["ISO_A2", "iso_a2", "ISO2", "ISO_2", "WB_A2", "iso_a2_eh", "BRK_A2"];
  
  for (const k of keys) {
    if (props && props[k] && props[k] !== "-99") {
      return String(props[k]).toLowerCase();
    }
  }
  
  const a3 = props?.ISO_A3 || props?.ADM0_A3 || props?.iso_a3 || props?.SOV_A3;
  const mapA3 = {
    // Avrupa
    TUR: "tr", DEU: "de", FRA: "fr", GBR: "gb", ITA: "it", ESP: "es",
    POL: "pl", ROU: "ro", NLD: "nl", BEL: "be", GRC: "gr", PRT: "pt",
    SWE: "se", AUT: "at", CHE: "ch", NOR: "no", FIN: "fi", DNK: "dk",
    IRL: "ie", HUN: "hu", CZE: "cz", BGR: "bg", SVK: "sk", HRV: "hr",
    SRB: "rs", UKR: "ua", BLR: "by",
    
    // Amerika
    USA: "us", CAN: "ca", MEX: "mx", BRA: "br", ARG: "ar", COL: "co",
    VEN: "ve", PER: "pe", CHL: "cl", ECU: "ec", BOL: "bo", PRY: "py",
    URY: "uy", CUB: "cu", DOM: "do", HTI: "ht", JAM: "jm", GTM: "gt",
    HND: "hn", NIC: "ni", CRI: "cr", PAN: "pa", SLV: "sv", BLZ: "bz",
    GRL: "gl", PRI: "pr", VIR: "vi", ASM: "as", MNP: "mp", GUM: "gu",
    
    // Asya
    CHN: "cn", IND: "in", JPN: "jp", KOR: "kr", IDN: "id", THA: "th",
    MYS: "my", VNM: "vn", PHL: "ph", PAK: "pk", BGD: "bd", MMR: "mm",
    AFG: "af", LKA: "lk", NPL: "np", KHM: "kh", LAO: "la", SGP: "sg",
    
    // Orta Doğu
    SAU: "sa", IRN: "ir", IRQ: "iq", SYR: "sy", JOR: "jo", ISR: "il",
    LBN: "lb", ARE: "ae", KWT: "kw", QAT: "qa", BHR: "bh", OMN: "om",
    YEM: "ye", AZE: "az", GEO: "ge", ARM: "am",
    
    // Afrika (54 ülke)
    EGY: "eg", ZAF: "za", NGA: "ng", KEN: "ke", ETH: "et", TZA: "tz",
    UGA: "ug", DZA: "dz", MAR: "ma", TUN: "tn", LBY: "ly", SDN: "sd",
    GHA: "gh", CIV: "ci", CMR: "cm", AGO: "ao", MOZ: "mz", MDG: "mg",
    ZWE: "zw", ZMB: "zm", MWI: "mw", SEN: "sn", MLI: "ml", BFA: "bf",
    NER: "ne", TCD: "td", SOM: "so", RWA: "rw", BDI: "bi", BEN: "bj",
    TGO: "tg", ERI: "er", SSD: "ss", LBR: "lr", SLE: "sl", GIN: "gn",
    GNB: "gw", GMB: "gm", GAB: "ga", COG: "cg", COD: "cd", CAF: "cf",
    MRT: "mr", NAM: "na", BWA: "bw", SWZ: "sz", LSO: "ls", MUS: "mu",
    SYC: "sc", COM: "km", CPV: "cv", STP: "st", GNQ: "gq", DJI: "dj",
    
    // Okyanusya
    AUS: "au", NZL: "nz", PNG: "pg", FJI: "fj",
    
    // Rusya ve Orta Asya
    RUS: "ru", KAZ: "kz", UZB: "uz", TKM: "tm", KGZ: "kg", TJK: "tj", MNG: "mn"
  };
  
  if (a3 && mapA3[a3.toUpperCase()]) {
    return mapA3[a3.toUpperCase()];
  }
  
  return null;
}

function guessISO2FromName(name = "") {
  const t = name.toLowerCase().trim();
  const map = {
    // Avrupa
    "turkey": "tr", "türkiye": "tr", "germany": "de", "france": "fr",
    "united kingdom": "gb", "uk": "gb", "great britain": "gb", "britain": "gb",
    "italy": "it", "spain": "es", "poland": "pl", "romania": "ro",
    "netherlands": "nl", "holland": "nl", "belgium": "be", "greece": "gr",
    "portugal": "pt", "sweden": "se", "austria": "at", "switzerland": "ch",
    "norway": "no", "finland": "fi", "denmark": "dk", "ireland": "ie",
    "hungary": "hu", "czech republic": "cz", "czechia": "cz", "bulgaria": "bg",
    "slovakia": "sk", "croatia": "hr", "serbia": "rs", "ukraine": "ua",
    "belarus": "by",
    
    // Amerika
    "united states": "us", "usa": "us", "america": "us", "u.s.a.": "us",
    "canada": "ca", "mexico": "mx", "brazil": "br", "brasil": "br",
    "argentina": "ar", "colombia": "co", "venezuela": "ve", "peru": "pe",
    "chile": "cl", "ecuador": "ec", "bolivia": "bo", "paraguay": "py",
    "uruguay": "uy", "cuba": "cu", "dominican republic": "do", "haiti": "ht",
    "jamaica": "jm", "guatemala": "gt", "honduras": "hn", "nicaragua": "ni",
    "costa rica": "cr", "panama": "pa", "el salvador": "sv", "belize": "bz",
    
    // Asya
    "china": "cn", "india": "in", "japan": "jp", "south korea": "kr",
    "korea": "kr", "indonesia": "id", "thailand": "th", "malaysia": "my",
    "vietnam": "vn", "philippines": "ph", "pakistan": "pk", "bangladesh": "bd",
    "myanmar": "mm", "burma": "mm", "afghanistan": "af", "sri lanka": "lk",
    "nepal": "np", "cambodia": "kh", "laos": "la", "singapore": "sg",
    
    // Orta Doğu
    "saudi arabia": "sa", "iran": "ir", "iraq": "iq", "syria": "sy",
    "jordan": "jo", "israel": "il", "lebanon": "lb", "uae": "ae",
    "united arab emirates": "ae", "kuwait": "kw", "qatar": "qa",
    "bahrain": "bh", "oman": "om", "yemen": "ye", "azerbaijan": "az",
    "georgia": "ge", "armenia": "am",
    
    // Afrika
    "egypt": "eg", "south africa": "za", "nigeria": "ng", "kenya": "ke",
    "ethiopia": "et", "tanzania": "tz", "uganda": "ug", "algeria": "dz",
    "morocco": "ma", "tunisia": "tn", "libya": "ly", "sudan": "sd",
    "ghana": "gh", "ivory coast": "ci", "cameroon": "cm", "angola": "ao",
    "mozambique": "mz", "madagascar": "mg", "zimbabwe": "zw", "zambia": "zm",
    "malawi": "mw", "senegal": "sn",
    
    // Okyanusya
    "australia": "au", "new zealand": "nz", "papua new guinea": "pg", "fiji": "fj",
    
    // Rusya ve Orta Asya
    "russia": "ru", "russian federation": "ru", "kazakhstan": "kz",
    "uzbekistan": "uz", "turkmenistan": "tm", "kyrgyzstan": "kg",
    "tajikistan": "tj", "mongolia": "mn"
  };
  
  return map[t] || null;
}

function getCountryNameTurkish(englishName) {
  const nameMap = {
    // Avrupa
    "Turkey": "Türkiye",
    "Germany": "Almanya",
    "France": "Fransa",
    "United Kingdom": "Birleşik Krallık",
    "Italy": "İtalya",
    "Spain": "İspanya",
    "Poland": "Polonya",
    "Romania": "Romanya",
    "Netherlands": "Hollanda",
    "Belgium": "Belçika",
    "Greece": "Yunanistan",
    "Portugal": "Portekiz",
    "Sweden": "İsveç",
    "Austria": "Avusturya",
    "Switzerland": "İsviçre",
    "Norway": "Norveç",
    "Finland": "Finlandiya",
    "Denmark": "Danimarka",
    "Ireland": "İrlanda",
    "Hungary": "Macaristan",
    "Czech Republic": "Çekya",
    "Czechia": "Çekya",
    "Bulgaria": "Bulgaristan",
    "Slovakia": "Slovakya",
    "Croatia": "Hırvatistan",
    "Serbia": "Sırbistan",
    "Ukraine": "Ukrayna",
    "Belarus": "Belarus",
    
    // Amerika
    "United States": "Amerika Birleşik Devletleri",
    "United States of America": "Amerika Birleşik Devletleri",
    "Canada": "Kanada",
    "Mexico": "Meksika",
    "Brazil": "Brezilya",
    "Argentina": "Arjantin",
    "Colombia": "Kolombiya",
    "Venezuela": "Venezuela",
    "Peru": "Peru",
    "Chile": "Şili",
    "Ecuador": "Ekvador",
    "Bolivia": "Bolivya",
    "Paraguay": "Paraguay",
    "Uruguay": "Uruguay",
    "Cuba": "Küba",
    "Dominican Republic": "Dominik Cumhuriyeti",
    "Haiti": "Haiti",
    "Jamaica": "Jamaika",
    "Guatemala": "Guatemala",
    "Honduras": "Honduras",
    "Nicaragua": "Nikaragua",
    "Costa Rica": "Kosta Rika",
    "Panama": "Panama",
    "El Salvador": "El Salvador",
    "Belize": "Belize",
    
    // Asya
    "China": "Çin",
    "India": "Hindistan",
    "Japan": "Japonya",
    "South Korea": "Güney Kore",
    "Indonesia": "Endonezya",
    "Thailand": "Tayland",
    "Malaysia": "Malezya",
    "Vietnam": "Vietnam",
    "Philippines": "Filipinler",
    "Pakistan": "Pakistan",
    "Bangladesh": "Bangladeş",
    "Myanmar": "Myanmar",
    "Afghanistan": "Afganistan",
    "Sri Lanka": "Sri Lanka",
    "Nepal": "Nepal",
    "Cambodia": "Kamboçya",
    "Laos": "Laos",
    "Singapore": "Singapur",
    
    // Orta Doğu
    "Saudi Arabia": "Suudi Arabistan",
    "Iran": "İran",
    "Iraq": "Irak",
    "Syria": "Suriye",
    "Syrian Arab Republic": "Suriye",
    "Jordan": "Ürdün",
    "Israel": "İsrail",
    "Lebanon": "Lübnan",
    "United Arab Emirates": "Birleşik Arap Emirlikleri",
    "Kuwait": "Kuveyt",
    "Qatar": "Katar",
    "Bahrain": "Bahreyn",
    "Oman": "Umman",
    "Yemen": "Yemen",
    "Azerbaijan": "Azerbaycan",
    "Georgia": "Gürcistan",
    "Armenia": "Ermenistan",
    
    // Afrika (54 ülke - TAM LİSTE)
    "Egypt": "Mısır",
    "South Africa": "Güney Afrika",
    "Nigeria": "Nijerya",
    "Kenya": "Kenya",
    "Ethiopia": "Etiyopya",
    "Tanzania": "Tanzanya",
    "Uganda": "Uganda",
    "Algeria": "Cezayir",
    "Morocco": "Fas",
    "Tunisia": "Tunus",
    "Libya": "Libya",
    "Sudan": "Sudan",
    "South Sudan": "Güney Sudan",
    "Ghana": "Gana",
    "Ivory Coast": "Fildişi Sahili",
    "Côte d'Ivoire": "Fildişi Sahili",
    "Cameroon": "Kamerun",
    "Angola": "Angola",
    "Mozambique": "Mozambik",
    "Madagascar": "Madagaskar",
    "Zimbabwe": "Zimbabve",
    "Zambia": "Zambiya",
    "Malawi": "Malavi",
    "Senegal": "Senegal",
    "Mali": "Mali",
    "Burkina Faso": "Burkina Faso",
    "Niger": "Nijer",
    "Chad": "Çad",
    "Somalia": "Somali",
    "Rwanda": "Ruanda",
    "Burundi": "Burundi",
    "Benin": "Benin",
    "Togo": "Togo",
    "Eritrea": "Eritre",
    "Liberia": "Liberya",
    "Sierra Leone": "Sierra Leone",
    "Guinea": "Gine",
    "Guinea-Bissau": "Gine-Bissau",
    "Gambia": "Gambiya",
    "Gabon": "Gabon",
    "Republic of the Congo": "Kongo Cumhuriyeti",
    "Republic of Congo": "Kongo Cumhuriyeti",
    "Congo": "Kongo",
    "Democratic Republic of the Congo": "Kongo Demokratik Cumhuriyeti",
    "DR Congo": "Kongo Demokratik Cumhuriyeti",
    "DRC": "Kongo Demokratik Cumhuriyeti",
    "Central African Republic": "Orta Afrika Cumhuriyeti",
    "Mauritania": "Moritanya",
    "Namibia": "Namibya",
    "Botswana": "Botsvana",
    "Eswatini": "Esvatini",
    "Swaziland": "Esvatini",
    "Lesotho": "Lesotho",
    "Mauritius": "Mauritius",
    "Seychelles": "Seyşeller",
    "Comoros": "Komorlar",
    "Cape Verde": "Yeşil Burun Adaları",
    "São Tomé and Príncipe": "São Tomé ve Príncipe",
    "Sao Tome and Principe": "São Tomé ve Príncipe",
    "Equatorial Guinea": "Ekvator Ginesi",
    "Djibouti": "Cibuti",
    
    // Kuzey Amerika - ABD Bölgeleri ve Grönland
    "Greenland": "Grönland",
    "Puerto Rico": "Porto Riko",
    "US Virgin Islands": "ABD Virjin Adaları",
    "American Samoa": "Amerikan Samoası",
    "Northern Mariana Islands": "Kuzey Mariana Adaları",
    "Guam": "Guam",
    
    // Okyanusya
    "Australia": "Avustralya",
    "New Zealand": "Yeni Zelanda",
    "Papua New Guinea": "Papua Yeni Gine",
    "Fiji": "Fiji",
    
    // Rusya ve Orta Asya
    "Russia": "Rusya",
    "Russian Federation": "Rusya",
    "Kazakhstan": "Kazakistan",
    "Uzbekistan": "Özbekistan",
    "Turkmenistan": "Türkmenistan",
    "Kyrgyzstan": "Kırgızistan",
    "Tajikistan": "Tacikistan",
    "Mongolia": "Moğolistan"
  };
  
  return nameMap[englishName] || englishName;
}

// ========================================
// GRAFİK ÇİZİMİ (KALDIRILDI)
// ========================================

function renderTemporaryCharts(countryName) {
  // Grafikler kaldırıldı
  console.log('ℹ️ Grafikler devre dışı');
}

// Global yap
window.renderTemporaryCharts = renderTemporaryCharts;

// ========================================
// ÜLKE BİLGİLERİNİ GÖSTER
// ========================================

function showCountryInfo(p) {
  const infoPanel = el('info');
  if (infoPanel) {
    infoPanel.style.display = 'block';
  }
  
  const turkishName = getCountryNameTurkish(p.name);
  const iso2 = getISO2(p) || guessISO2FromName(p.name);
  
  console.log(`🌍 Ülke seçildi: ${turkishName} (${iso2})`);
  
  if (iso2) {
    loadCountryDataSmart(iso2, turkishName);
  } else {
    console.warn('⚠️ ISO2 kodu bulunamadı');
    el("country-name").textContent = turkishName || 'Bilinmeyen Ülke';
    el("pop").textContent = '—';
    el("gdp").textContent = '—';
    el("score").textContent = '—';
    el("water-text").innerHTML = '<p>Bu ülke hakkında bilgi bulunamadı.</p>';
    
    const flag = el('flag');
    if (flag) flag.style.display = 'none';
    
    renderTemporaryCharts(turkishName);
  }
}

window.showCountryInfo = showCountryInfo;

// ========================================
// AKILLI VERİ YÜKLEME (CACHE + OPTİMİZE)
// ========================================

async function loadCountryDataSmart(iso2, countryName) {
  console.log(`📥 Veri aranıyor: ${iso2}`);

  // 1️⃣ Cache kontrolü
  if (dataCache.has(iso2)) {
    updatePanelWithRealData(dataCache.get(iso2), iso2);
    updateMapColors(); // Renkleri güncelle
    return;
  }

  // Hemen geçici veri göster
  showTemporaryData(countryName, iso2);

  // 2️⃣ Önce yerel JSON'dan dene
  try {
    const res = await fetch(`data/${iso2}.json`);
    if (res.ok) {
      const json = await res.json();
      dataCache.set(iso2, json);
      updatePanelWithRealData(json, iso2);
      console.log(`✅ JSON yüklendi: ${iso2}`);
      updateMapColors();
      return;
    }
  } catch (err) {
    console.log(`ℹ️ ${iso2}.json bulunamadı, API'lerden çekiliyor...`);
  }

  // 3️⃣ API'lerden gerçek veri çek
  try {
    const apiData = await fetchAllCountryData(iso2, countryName);
    
    if (apiData && apiData.waterScore !== null) {
      dataCache.set(iso2, apiData);
      updatePanelWithRealData(apiData, iso2);
      console.log(`✅ API'lerden veri alındı: ${iso2}`);
      updateMapColors(); // Haritayı yeni veriye göre renklendir
      return;
    }
  } catch (err) {
    console.warn(`⚠️ API hatası: ${err.message}`);
  }

  // 4️⃣ Hiçbir veri yoksa
  updatePanelWithNoData(countryName);
}

window.loadCountryDataSmart = loadCountryDataSmart;

// ========================================
// GEÇİCİ VERİ GÖSTER (HEMEN)
// ========================================

function showTemporaryData(countryName, iso2) {
  el('country-name').textContent = countryName;
  
  const flag = el('flag');
  if (iso2) {
    flag.src = `https://flagcdn.com/w40/${iso2}.png`;
    flag.style.display = 'inline-block';
  }
  
  el('pop').textContent = '...';
  el('gdp').textContent = '...';
  el('score').textContent = '...';
  
  el('water-text').innerHTML = `
    <div style="text-align:center; padding:20px;">
      <div style="font-size:40px; margin-bottom:10px;">🌐</div>
      <p style="margin:5px 0;"><strong>Veri yükleniyor...</strong></p>
      <p style="font-size:12px; color:#666;">RestCountries • World Bank • Wikipedia</p>
    </div>
  `;
  
  console.log('⏳ Geçici veri gösteriliyor...');
}

// ========================================
// PANEL GÜNCELLEME FONKSİYONLARI
// ========================================

function updatePanelWithRealData(data, iso2) {
  el('country-name').textContent = data.name || 'Bilinmeyen Ülke';
  el('pop').textContent = data.population ? fmtNum(data.population) : '—';
  el('gdp').textContent = data.gdp ? fmtNum(data.gdp) + ' $' : '—';
  el('score').textContent = data.waterScore ?? 5;
  
  const flag = el('flag');
  if (iso2) {
    flag.src = `https://flagcdn.com/w40/${iso2}.png`;
    flag.style.display = 'inline-block';
  }
  
  let infoHTML = '';
  if (data.info) {
    infoHTML = `
      <div style="line-height: 1.6;">
        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
          <strong style="font-size: 14px; color: #1e40af;">📊 GENEL DURUM</strong>
          <div style="margin-top: 10px;">${data.info.genel}</div>
        </div>
        
        <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
          <strong style="font-size: 14px; color: #dc2626;">⚠️ SORUNLAR VE RİSKLER</strong>
          <div style="margin-top: 10px;">${data.info.sorunlar}</div>
        </div>
        
        <div style="margin-bottom: 15px;">
          <strong style="font-size: 14px; color: #16a34a;">✅ ÇÖZÜM ÖNERİLERİ</strong>
          <div style="margin-top: 10px;">${data.info.cozumler}</div>
        </div>
      </div>
    `;
    
    if (data.sources) {
      infoHTML += `
        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #666;">
          <strong>📚 Kaynaklar:</strong> ${data.sources}
        </div>
      `;
    }
  } else {
    infoHTML = '<p>Bu ülke hakkında detaylı bilgi henüz eklenmedi.</p>';
  }
  
  el('water-text').innerHTML = infoHTML;
  
  const canvas = el('country-watermap-canvas');
  if (canvas && typeof window.drawCountryWaterMap === 'function' && data.waterData) {
    const panelWidth = el('info').offsetWidth - 40;
    canvas.style.display = 'block';
    window.drawCountryWaterMap('country-watermap-canvas', data, 'grid', panelWidth);
  } else if (canvas) {
    canvas.style.display = 'none';
  }
  
  renderChartsFromData(data);
  
  console.log('✅ Panel güncellendi');
}

function updatePanelWithNoData(countryName) {
  el('country-name').textContent = countryName;
  el('pop').textContent = '—';
  el('gdp').textContent = '—';
  el('score').textContent = '—';
  el('flag').style.display = 'none';
  el('water-text').innerHTML = '<p>Bu ülke hakkında veri bulunmamaktadır.</p>';
  
  const canvas = el('country-watermap-canvas');
  if (canvas) canvas.style.display = 'none';
  
  // Grafik yok etme kaldırıldı
}

// ========================================
// GRAFİK ÇİZİMİ (KALDIRILDI)
// ========================================

function renderChartsFromData(data) {
  // Grafikler kaldırıldı
  console.log('ℹ️ Grafikler devre dışı');
}

// ========================================
// BİLGİLERİ SIFIRLA
// ========================================

function resetInfo() {
  const infoPanel = el('info');
  if (infoPanel) infoPanel.style.display = 'none';
  
  el("country-name").textContent = "Dünya Su Kaynakları";
  el("pop").textContent = "—";
  el("gdp").textContent = "—";
  el("score").textContent = "—";
  el("water-text").textContent = "Bir ülkeye tıklayarak bilgi alın.";
  
  const flag = el("flag");
  if (flag) flag.style.display = "none";
  
  // Grafik yok etme kaldırıldı
  
  if (map) {
    map.setView([20, 0], 2, {
      animate: true,
      duration: 1.5
    });
  }
}

window.resetInfo = resetInfo;

// ========================================
// HARİTA RENKLENDİRME (3D SENKRONÄ°ZE)
// ========================================

function updateMapColors() {
  if (!currentLayer) return;
  
  let updateCount = 0;
  
  currentLayer.eachLayer(layer => {
    const iso2 = layer._iso2;
    const score = waterScoreData.get(iso2);
    
    const color = getColorByWaterScore(score);
    
    layer.setStyle({
      fillColor: color,
      fillOpacity: 0.7,
      color: "#3d4a5a",
      weight: 1
    });
    
    updateCount++;
  });
  
  console.log(`🎨 2D harita renkleri güncellendi (${updateCount} ülke)`);
  
  // 3D'yi de güncelle
  sync2DTo3D();
}

// ========================================
// 2D'DEN 3D'YE GERÇEK ZAMANLI SENKRONÄ°ZASYON
// ========================================

function sync2DTo3D() {
  // 3D viewer yoksa veya 3D mod değilse çıkış
  if (!window.viewer || !window.viewer.entities) {
    return;
  }
  
  let updateCount = 0;
  
  try {
    window.viewer.entities.values.forEach(entity => {
      if (!entity.polygon || !entity.properties) return;
      
      const iso2Prop = entity.properties.iso2;
      if (!iso2Prop || !iso2Prop._value) return;
      
      const iso2 = iso2Prop._value.toLowerCase();
      const score = waterScoreData.get(iso2);
      
      if (score !== undefined && score !== null) {
        const newColor = window.getWaterColor ? window.getWaterColor(score) : null;
        
        if (newColor && entity.polygon.material) {
          entity.polygon.material = newColor.withAlpha(0.7);
          entity.properties.originalColor = newColor;
          entity.properties.waterScore = score;
          updateCount++;
        }
      }
    });
    
    if (updateCount > 0) {
      console.log(`✅ 3D harita senkronize edildi (${updateCount} ülke)`);
    }
  } catch (err) {
    console.warn('⚠️ 3D senkronizasyon hatası:', err.message);
  }
}

window.sync2DTo3D = sync2DTo3D;

// Tüm ülkeleri ön yükle ve renklendir
async function preloadWaterScores() {
  console.log('🌍 Tüm dünya ülkeleri için su skorları hesaplanıyor...');
  
  const countries = [
    // Avrupa (50 ülke)
    { iso2: 'tr', name: 'Turkey' },
    { iso2: 'de', name: 'Germany' },
    { iso2: 'fr', name: 'France' },
    { iso2: 'gb', name: 'United Kingdom' },
    { iso2: 'it', name: 'Italy' },
    { iso2: 'es', name: 'Spain' },
    { iso2: 'pl', name: 'Poland' },
    { iso2: 'ro', name: 'Romania' },
    { iso2: 'nl', name: 'Netherlands' },
    { iso2: 'be', name: 'Belgium' },
    { iso2: 'gr', name: 'Greece' },
    { iso2: 'pt', name: 'Portugal' },
    { iso2: 'se', name: 'Sweden' },
    { iso2: 'at', name: 'Austria' },
    { iso2: 'ch', name: 'Switzerland' },
    { iso2: 'no', name: 'Norway' },
    { iso2: 'fi', name: 'Finland' },
    { iso2: 'dk', name: 'Denmark' },
    { iso2: 'ie', name: 'Ireland' },
    { iso2: 'hu', name: 'Hungary' },
    { iso2: 'cz', name: 'Czech Republic' },
    { iso2: 'bg', name: 'Bulgaria' },
    { iso2: 'sk', name: 'Slovakia' },
    { iso2: 'hr', name: 'Croatia' },
    { iso2: 'rs', name: 'Serbia' },
    { iso2: 'ua', name: 'Ukraine' },
    { iso2: 'by', name: 'Belarus' },
    { iso2: 'lt', name: 'Lithuania' },
    { iso2: 'lv', name: 'Latvia' },
    { iso2: 'ee', name: 'Estonia' },
    { iso2: 'si', name: 'Slovenia' },
    { iso2: 'ba', name: 'Bosnia and Herzegovina' },
    { iso2: 'mk', name: 'North Macedonia' },
    { iso2: 'al', name: 'Albania' },
    { iso2: 'me', name: 'Montenegro' },
    { iso2: 'xk', name: 'Kosovo' },
    { iso2: 'md', name: 'Moldova' },
    { iso2: 'is', name: 'Iceland' },
    { iso2: 'lu', name: 'Luxembourg' },
    { iso2: 'mt', name: 'Malta' },
    { iso2: 'cy', name: 'Cyprus' },
    { iso2: 'mc', name: 'Monaco' },
    { iso2: 'ad', name: 'Andorra' },
    { iso2: 'sm', name: 'San Marino' },
    { iso2: 'va', name: 'Vatican City' },
    { iso2: 'li', name: 'Liechtenstein' },
    
    // Kuzey Amerika (3 ülke + bölgeler)
    { iso2: 'us', name: 'United States' },
    { iso2: 'ca', name: 'Canada' },
    { iso2: 'mx', name: 'Mexico' },
    { iso2: 'gl', name: 'Greenland' },
    { iso2: 'pr', name: 'Puerto Rico' },
    { iso2: 'vi', name: 'US Virgin Islands' },
    { iso2: 'as', name: 'American Samoa' },
    { iso2: 'mp', name: 'Northern Mariana Islands' },
    { iso2: 'gu', name: 'Guam' },
    
    // Orta Amerika ve Karayipler (20 ülke)
    { iso2: 'gt', name: 'Guatemala' },
    { iso2: 'hn', name: 'Honduras' },
    { iso2: 'ni', name: 'Nicaragua' },
    { iso2: 'cr', name: 'Costa Rica' },
    { iso2: 'pa', name: 'Panama' },
    { iso2: 'sv', name: 'El Salvador' },
    { iso2: 'bz', name: 'Belize' },
    { iso2: 'cu', name: 'Cuba' },
    { iso2: 'do', name: 'Dominican Republic' },
    { iso2: 'ht', name: 'Haiti' },
    { iso2: 'jm', name: 'Jamaica' },
    { iso2: 'tt', name: 'Trinidad and Tobago' },
    { iso2: 'bb', name: 'Barbados' },
    { iso2: 'bs', name: 'Bahamas' },
    { iso2: 'gd', name: 'Grenada' },
    { iso2: 'lc', name: 'Saint Lucia' },
    { iso2: 'vc', name: 'Saint Vincent' },
    { iso2: 'ag', name: 'Antigua and Barbuda' },
    { iso2: 'dm', name: 'Dominica' },
    { iso2: 'kn', name: 'Saint Kitts and Nevis' },
    
    // Güney Amerika (12 ülke)
    { iso2: 'br', name: 'Brazil' },
    { iso2: 'ar', name: 'Argentina' },
    { iso2: 'co', name: 'Colombia' },
    { iso2: 've', name: 'Venezuela' },
    { iso2: 'pe', name: 'Peru' },
    { iso2: 'cl', name: 'Chile' },
    { iso2: 'ec', name: 'Ecuador' },
    { iso2: 'bo', name: 'Bolivia' },
    { iso2: 'py', name: 'Paraguay' },
    { iso2: 'uy', name: 'Uruguay' },
    { iso2: 'gy', name: 'Guyana' },
    { iso2: 'sr', name: 'Suriname' },
    
    // Asya (48 ülke)
    { iso2: 'cn', name: 'China' },
    { iso2: 'in', name: 'India' },
    { iso2: 'jp', name: 'Japan' },
    { iso2: 'kr', name: 'South Korea' },
    { iso2: 'id', name: 'Indonesia' },
    { iso2: 'th', name: 'Thailand' },
    { iso2: 'my', name: 'Malaysia' },
    { iso2: 'vn', name: 'Vietnam' },
    { iso2: 'ph', name: 'Philippines' },
    { iso2: 'pk', name: 'Pakistan' },
    { iso2: 'bd', name: 'Bangladesh' },
    { iso2: 'mm', name: 'Myanmar' },
    { iso2: 'af', name: 'Afghanistan' },
    { iso2: 'lk', name: 'Sri Lanka' },
    { iso2: 'np', name: 'Nepal' },
    { iso2: 'kh', name: 'Cambodia' },
    { iso2: 'la', name: 'Laos' },
    { iso2: 'sg', name: 'Singapore' },
    { iso2: 'tw', name: 'Taiwan' },
    { iso2: 'kp', name: 'North Korea' },
    { iso2: 'bt', name: 'Bhutan' },
    { iso2: 'mv', name: 'Maldives' },
    { iso2: 'bn', name: 'Brunei' },
    { iso2: 'tl', name: 'Timor-Leste' },
    
    // Orta Doğu (16 ülke)
    { iso2: 'sa', name: 'Saudi Arabia' },
    { iso2: 'ir', name: 'Iran' },
    { iso2: 'iq', name: 'Iraq' },
    { iso2: 'sy', name: 'Syria' },
    { iso2: 'jo', name: 'Jordan' },
    { iso2: 'il', name: 'Israel' },
    { iso2: 'lb', name: 'Lebanon' },
    { iso2: 'ae', name: 'United Arab Emirates' },
    { iso2: 'kw', name: 'Kuwait' },
    { iso2: 'qa', name: 'Qatar' },
    { iso2: 'bh', name: 'Bahrain' },
    { iso2: 'om', name: 'Oman' },
    { iso2: 'ye', name: 'Yemen' },
    { iso2: 'az', name: 'Azerbaijan' },
    { iso2: 'ge', name: 'Georgia' },
    { iso2: 'am', name: 'Armenia' },
    
    // Afrika (54 ülke - tam liste)
    { iso2: 'eg', name: 'Egypt' },
    { iso2: 'za', name: 'South Africa' },
    { iso2: 'ng', name: 'Nigeria' },
    { iso2: 'ke', name: 'Kenya' },
    { iso2: 'et', name: 'Ethiopia' },
    { iso2: 'tz', name: 'Tanzania' },
    { iso2: 'ug', name: 'Uganda' },
    { iso2: 'dz', name: 'Algeria' },
    { iso2: 'ma', name: 'Morocco' },
    { iso2: 'tn', name: 'Tunisia' },
    { iso2: 'ly', name: 'Libya' },
    { iso2: 'sd', name: 'Sudan' },
    { iso2: 'gh', name: 'Ghana' },
    { iso2: 'ci', name: 'Ivory Coast' },
    { iso2: 'cm', name: 'Cameroon' },
    { iso2: 'ao', name: 'Angola' },
    { iso2: 'mz', name: 'Mozambique' },
    { iso2: 'mg', name: 'Madagascar' },
    { iso2: 'zw', name: 'Zimbabwe' },
    { iso2: 'zm', name: 'Zambia' },
    { iso2: 'mw', name: 'Malawi' },
    { iso2: 'sn', name: 'Senegal' },
    { iso2: 'ml', name: 'Mali' },
    { iso2: 'bf', name: 'Burkina Faso' },
    { iso2: 'ne', name: 'Niger' },
    { iso2: 'td', name: 'Chad' },
    { iso2: 'so', name: 'Somalia' },
    { iso2: 'rw', name: 'Rwanda' },
    { iso2: 'bi', name: 'Burundi' },
    { iso2: 'bj', name: 'Benin' },
    { iso2: 'tg', name: 'Togo' },
    { iso2: 'er', name: 'Eritrea' },
    { iso2: 'ss', name: 'South Sudan' },
    { iso2: 'lr', name: 'Liberia' },
    { iso2: 'sl', name: 'Sierra Leone' },
    { iso2: 'gn', name: 'Guinea' },
    { iso2: 'gw', name: 'Guinea-Bissau' },
    { iso2: 'gm', name: 'Gambia' },
    { iso2: 'ga', name: 'Gabon' },
    { iso2: 'cg', name: 'Republic of Congo' },
    { iso2: 'cd', name: 'DR Congo' },
    { iso2: 'cf', name: 'Central African Republic' },
    { iso2: 'mr', name: 'Mauritania' },
    { iso2: 'na', name: 'Namibia' },
    { iso2: 'bw', name: 'Botswana' },
    { iso2: 'sz', name: 'Eswatini' },
    { iso2: 'ls', name: 'Lesotho' },
    { iso2: 'mu', name: 'Mauritius' },
    { iso2: 'sc', name: 'Seychelles' },
    { iso2: 'km', name: 'Comoros' },
    { iso2: 'cv', name: 'Cape Verde' },
    { iso2: 'st', name: 'Sao Tome and Principe' },
    { iso2: 'gq', name: 'Equatorial Guinea' },
    { iso2: 'dj', name: 'Djibouti' },
    
    // Okyanusya (14 ülke)
    { iso2: 'au', name: 'Australia' },
    { iso2: 'nz', name: 'New Zealand' },
    { iso2: 'pg', name: 'Papua New Guinea' },
    { iso2: 'fj', name: 'Fiji' },
    { iso2: 'sb', name: 'Solomon Islands' },
    { iso2: 'vu', name: 'Vanuatu' },
    { iso2: 'nc', name: 'New Caledonia' },
    { iso2: 'pf', name: 'French Polynesia' },
    { iso2: 'ws', name: 'Samoa' },
    { iso2: 'gu', name: 'Guam' },
    { iso2: 'ki', name: 'Kiribati' },
    { iso2: 'to', name: 'Tonga' },
    { iso2: 'fm', name: 'Micronesia' },
    { iso2: 'mh', name: 'Marshall Islands' },
    
    // Rusya ve Orta Asya (7 ülke)
    { iso2: 'ru', name: 'Russia' },
    { iso2: 'kz', name: 'Kazakhstan' },
    { iso2: 'uz', name: 'Uzbekistan' },
    { iso2: 'tm', name: 'Turkmenistan' },
    { iso2: 'kg', name: 'Kyrgyzstan' },
    { iso2: 'tj', name: 'Tajikistan' },
    { iso2: 'mn', name: 'Mongolia' }
  ];
  
  console.log(`📋 Toplam ${countries.length} ülke yüklenecek`);
  
  // İlk 15 ülkeyi hemen yükle (öncelikli)
  const batch1 = countries.slice(0, 15).map(c => 
    fetchWorldBankWaterData(c.iso2).then(data => {
      if (data) {
        const score = calculateWaterScore(data, null);
        waterScoreData.set(c.iso2, score);
        console.log(`✓ ${c.name}: ${score}/10`);
      }
    }).catch(() => {})
  );
  
  await Promise.all(batch1);
  updateMapColors();
  console.log(`✅ İlk 15 ülke yüklendi`);
  
  // Geri kalanları 15'er 15'er yükle (performans için)
  for (let i = 15; i < countries.length; i += 15) {
    setTimeout(async () => {
      const batch = countries.slice(i, i + 15).map(c => 
        fetchWorldBankWaterData(c.iso2).then(data => {
          if (data) {
            const score = calculateWaterScore(data, null);
            waterScoreData.set(c.iso2, score);
          }
        }).catch(() => {})
      );
      
      await Promise.all(batch);
      updateMapColors(); // Her batch'te haritayı güncelle
      console.log(`✅ ${Math.min(i + 15, countries.length)}/${countries.length} ülke yüklendi`);
    }, (i / 15) * 2500); // Her batch 2.5 saniyede bir
  }
  
  // Tüm ülkeler yüklendiğinde
  setTimeout(() => {
    console.log('🎉 Tüm ülke skorları yüklendi ve harita renklendirildi!');
    updateMapColors(); // Final güncelleme
  }, Math.ceil(countries.length / 15) * 2500 + 2000);
}

// ========================================
// GEOJSON YÜKLEME VE ETKİLEŞİM
// ========================================

function loadGeoJSON() {
  console.log('📂 GeoJSON yükleniyor...');
  
  fetch("world.json")
    .then(r => r.json())
    .then(data => {
      console.log('✅ GeoJSON yüklendi');
      
      currentLayer = L.geoJSON(data, {
        // 🔹 DİNAMİK RENK - Su skoruna göre
        style: (feature) => {
          const props = feature.properties || {};
          const iso2 = getISO2(props) || guessISO2FromName(props.name || props.NAME);
          const score = waterScoreData.get(iso2);
          const fillColor = getColorByWaterScore(score);
          
          return {
            color: "#3d4a5a",
            weight: 1,
            fillOpacity: 0.7,
            fillColor: fillColor
          };
        },

        onEachFeature: (feature, layer) => {
          const props = {
            name: feature.properties?.name || feature.properties?.NAME || "",
            ISO_A2: feature.properties?.ISO_A2,
            iso_a2: feature.properties?.iso_a2,
            ISO_A3: feature.properties?.ISO_A3,
            ADM0_A3: feature.properties?.ADM0_A3
          };

          // ISO2 kodunu layer'a kaydet
          layer._iso2 = getISO2(props) || guessISO2FromName(props.name);

          // Hover efekti
          layer.on("mouseover", function() {
            this.setStyle({
              weight: 2,
              fillOpacity: 0.9
            });
          });

          layer.on("mouseout", function() {
            this.setStyle({
              weight: 1,
              fillOpacity: 0.7
            });
          });

          // Tıklama
          layer.on("click", () => {
            showCountryInfo(props);

            try {
              map.fitBounds(layer.getBounds(), {
                maxZoom: 5,
                padding: [10, 10],
                animate: true
              });
            } catch (e) {
              console.warn("⚠️ Zoom hatası:", e);
            }
          });

          // Tooltip
          const score = waterScoreData.get(layer._iso2);
          const scoreText = score !== undefined ? ` (Su Skoru: ${score}/10)` : '';
          
          layer.bindTooltip((props.name || "") + scoreText, {
            sticky: true,
            opacity: 0.9,
            direction: "center"
          });
        }
      }).addTo(map);

      console.log("🗺️ Harita hazır");
      
      // Arka planda su skorlarını yükle
      preloadWaterScores();
    })
    .catch(err => {
      console.error("❌ GeoJSON yüklenemedi:", err);
      const waterTextElement = el("water-text");
      if (waterTextElement) {
        waterTextElement.textContent = "Harita verileri yüklenemedi.";
      }
    });
}

// ========================================
// BAŞLATMA
// ========================================

document.addEventListener('DOMContentLoaded', function() {
  initMap();
  loadGeoJSON();
  addColorLegend();
  console.log('✅ 2D sistem başlatıldı');
});

// ========================================
// RENK LEJANDI
// ========================================

function addColorLegend() {
  const legend = L.control({ position: 'bottomright' });
  
  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'legend');
    div.style.cssText = `
      background: white;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      font-size: 12px;
      line-height: 1.5;
    `;
    
    div.innerHTML = '<strong>Su Rezervi Skoru</strong><br>';
    
    const levels = [
      { score: 10, label: 'Bolluk', color: waterColorScale[10] },
      { score: 8, label: 'Mükemmel', color: waterColorScale[8] },
      { score: 6, label: 'İyi', color: waterColorScale[6] },
      { score: 4, label: 'Düşük', color: waterColorScale[4] },
      { score: 2, label: 'Zayıf', color: waterColorScale[2] },
      { score: 0, label: 'Kıtlık', color: waterColorScale[0] }
    ];
    
    levels.forEach(level => {
      div.innerHTML += `
        <div style="margin: 4px 0;">
          <span style="
            display: inline-block;
            width: 20px;
            height: 12px;
            background: ${level.color};
            margin-right: 5px;
            border: 1px solid #999;
          "></span>
          ${level.score}/10 - ${level.label}
        </div>
      `;
    });
    
    return div;
  };
  
  legend.addTo(map);
}
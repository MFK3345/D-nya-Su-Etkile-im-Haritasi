// ========================================
// 3D SU KAYNAKLARI HARİTASI - YENİ YAPILANDIRMA
// ========================================

let viewer = null;
let currentMode = '2d';
let selectedEntity = null;

// ========================================
// GLOBAL FONKSİYONLAR
// ========================================

window.switchTo2D = switchTo2D;
window.switchTo3D = switchTo3D;

function switchTo2D() {
  currentMode = '2d';
  document.getElementById('map').style.display = 'block';
  document.getElementById('cesiumContainer').style.display = 'none';
  document.getElementById('btn2d').classList.add('active');
  document.getElementById('btn3d').classList.remove('active');
  console.log('✅ 2D moda geçildi');
}

function switchTo3D() {
  currentMode = '3d';
  document.getElementById('map').style.display = 'none';
  document.getElementById('cesiumContainer').style.display = 'block';
  document.getElementById('btn2d').classList.remove('active');
  document.getElementById('btn3d').classList.add('active');
  
  console.log('✅ 3D moda geçiliyor...');
  
  if (!viewer) {
    setTimeout(() => {
      init3DGlobe();
    }, 100);
  } else {
    // Viewer zaten varsa, skorları güncelle
    if (typeof syncScoresFrom2D === 'function') {
      syncScoresFrom2D();
    }
  }
}

// ========================================
// CESIUM BAŞLATMA
// ========================================

function init3DGlobe() {
  console.log('🌐 Cesium başlatılıyor...');
  
  if (typeof Cesium === 'undefined') {
    console.error('❌ Cesium kütüphanesi yüklenemedi!');
    alert('3D harita yüklenemedi. Lütfen internet bağlantınızı kontrol edin.');
    return;
  }
  
  try {
    // Cesium Ion Token
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlMjYyZjVkYy1mZDE0LTQyYWYtYTIwZS04ODIzMjdiMGU4M2IiLCJpZCI6MzU0NTY4LCJpYXQiOjE3NjE1OTMzNDB9.HIVvpg4rNdwkAnWLgbNgkQr1R-oBNKksU1KK77t5gJ4';

    // Viewer Oluştur
    viewer = new Cesium.Viewer('cesiumContainer', {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      animation: false,
      timeline: false
    });

    // Globe ayarları
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.depthTestAgainstTerrain = false;

    // Başlangıç kamera pozisyonu
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(30, 30, 20000000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0
      }
    });

    console.log('✅ Cesium başarıyla yüklendi');

    // Ülkeleri yükle
    setTimeout(() => loadCountries(), 300);

  } catch (error) {
    console.error('❌ Cesium hatası:', error);
    alert('3D harita yüklenemedi: ' + error.message);
  }
}

// ========================================
// RENK SİSTEMİ (2D ile senkronize)
// ========================================

function getWaterColor(score) {
  const colorMap = {
    0: '#8B0000',   // Çok Kötü
    1: '#B22222',   // Kötü
    2: '#DC143C',   // Zayıf
    3: '#FF6347',   // Yetersiz
    4: '#FFA500',   // Düşük
    5: '#FFD700',   // Orta
    6: '#ADFF2F',   // İyi
    7: '#7FFF00',   // Çok İyi
    8: '#32CD32',   // Mükemmel
    9: '#228B22',   // Zengin
    10: '#006400'   // Bolluk
  };
  
  if (score === null || score === undefined) {
    return Cesium.Color.fromCssColorString('#cccccc'); // Gri - veri yok
  }
  
  const rounded = Math.round(Math.max(0, Math.min(10, score)));
  return Cesium.Color.fromCssColorString(colorMap[rounded]);
}

// ========================================
// ÜLKE YÜKLEME
// ========================================

function loadCountries() {
  console.log('📂 Ülkeler yükleniyor (3D)...');
  
  fetch('world.json')
    .then(res => res.json())
    .then(geojson => {
      console.log('✅ GeoJSON yüklendi (3D)');
      
      let successCount = 0;
      let errorCount = 0;
      
      geojson.features.forEach(feature => {
        try {
          const props = feature.properties;
          const name = props.name || props.NAME || props.ADMIN || "Ülke";
          
          // ISO2 kodunu bul
          let iso2 = props.ISO_A2 || props.iso_a2 || props.WB_A2;
          if (iso2 === '-99') iso2 = null;
          if (iso2) iso2 = iso2.toLowerCase();
          
          // ISO2 yoksa tahmin et
          if (!iso2 && typeof window.getISO2 === 'function') {
            iso2 = window.getISO2(props);
          }
          if (!iso2 && typeof window.guessISO2FromName === 'function') {
            iso2 = window.guessISO2FromName(name);
          }
          
          // Su skorunu waterScoreData'dan al (varsa)
          let score = 5; // Varsayılan
          if (iso2 && window.waterScoreData && window.waterScoreData.has(iso2)) {
            score = window.waterScoreData.get(iso2);
            console.log(`🎨 ${name}: ${score}/10 (cache'den)`);
          } else {
            score = props.waterScore || 5;
          }
          
          const color = getWaterColor(score);
          
          // Koordinatları işle
          let positions = extractPositions(feature.geometry);
          
          if (positions && positions.length >= 6) {
            // Entity oluştur
            const entity = viewer.entities.add({
              name: name,
              polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(positions),
                material: color.withAlpha(0.7),
                outline: true,
                outlineColor: Cesium.Color.WHITE.withAlpha(0.6),
                outlineWidth: 1,
                height: 0
              },
              properties: {
                countryName: name,
                waterScore: score,
                population: props.population || props.POP_EST,
                gdp: props.gdp || props.GDP_MD,
                waterResources: props.waterResources || 'Bilgi mevcut değil',
                originalColor: color,
                iso2: iso2 || props.ISO_A2 || props.iso_a2,
                iso3: props.ISO_A3 || props.iso_a3 || props.ADM0_A3
              }
            });
            
            successCount++;
          }
        } catch (err) {
          errorCount++;
          console.warn('⚠️ Ülke işlenirken hata:', err.message);
        }
      });
      
      console.log(`✅ ${successCount} ülke 3D'de yüklendi, ${errorCount} hata`);
      
      // Tıklama sistemi
      setupInteractions();
      
      // 2D'den skorları 3D'ye senkronize et
      syncScoresFrom2D();
      
    })
    .catch(err => {
      console.error('❌ GeoJSON yükleme hatası (3D):', err);
    });
}

// ========================================
// 2D'DEN SKORLARI SENKRONÄ°ZE ET (GERÇEK ZAMANLI)
// ========================================

function syncScoresFrom2D() {
  if (!window.waterScoreData || window.waterScoreData.size === 0) {
    console.log('ℹ️ 2D skorları henüz yüklenmemiş, bekleniyor...');
    
    // 2 saniye sonra tekrar dene
    setTimeout(() => {
      if (window.waterScoreData && window.waterScoreData.size > 0) {
        syncScoresFrom2D();
      }
    }, 2000);
    return;
  }
  
  console.log(`🔄 2D skorları 3D haritaya aktarılıyor (${window.waterScoreData.size} ülke)...`);
  
  let updateCount = 0;
  
  viewer.entities.values.forEach(entity => {
    if (!entity.polygon || !entity.properties) return;
    
    const iso2Prop = entity.properties.iso2;
    if (!iso2Prop || !iso2Prop._value) return;
    
    const iso2 = String(iso2Prop._value).toLowerCase();
    const score = window.waterScoreData.get(iso2);
    
    if (score !== undefined && score !== null) {
      const newColor = getWaterColor(score);
      entity.polygon.material = newColor.withAlpha(0.7);
      entity.properties.originalColor = newColor;
      entity.properties.waterScore = score;
      updateCount++;
    }
  });
  
  console.log(`✅ ${updateCount} ülke 3D'de güncellendi`);
}

// Global erişim için
window.syncScoresFrom2D = syncScoresFrom2D;

// ========================================
// KOORDİNAT İŞLEME
// ========================================

function extractPositions(geometry) {
  let ring = null;
  
  if (geometry.type === 'Polygon') {
    ring = geometry.coordinates[0];
  } else if (geometry.type === 'MultiPolygon') {
    // En büyük poligonu bul
    let maxRing = null;
    let maxLen = 0;
    
    geometry.coordinates.forEach(poly => {
      if (poly[0].length > maxLen) {
        maxRing = poly[0];
        maxLen = poly[0].length;
      }
    });
    
    ring = maxRing;
  }
  
  if (!ring || ring.length < 3) return null;
  
  // Basitleştir (max 100 nokta)
  const positions = [];
  const step = Math.max(1, Math.floor(ring.length / 100));
  
  for (let i = 0; i < ring.length; i += step) {
    const coord = ring[i];
    if (coord && coord.length >= 2) {
      positions.push(coord[0]); // lon
      positions.push(coord[1]); // lat
    }
  }
  
  return positions;
}

// ========================================
// ETKİLEŞİM SİSTEMİ
// ========================================

function setupInteractions() {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  
  // TIKLAMA
  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    
    if (Cesium.defined(picked) && picked.id) {
      handleCountryClick(picked.id);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  
  // HOVER
  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.endPosition);
    
    if (Cesium.defined(picked) && picked.id && picked.id.polygon) {
      document.body.style.cursor = 'pointer';
      handleCountryHover(picked.id);
    } else {
      document.body.style.cursor = 'default';
      resetHover();
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

// ========================================
// TIKLAMA İŞLEMİ (API'LERDEN VERİ ÇEK)
// ========================================

function handleCountryClick(entity) {
  const props = entity.properties;
  const name = props.countryName?._value || entity.name;
  
  console.log('🌍 3D Ülke tıklandı:', name);
  
  // ISO2 kodunu bul
  let iso2 = null;
  
  if (props.iso2 && props.iso2._value && props.iso2._value !== '-99') {
    iso2 = String(props.iso2._value).toLowerCase();
  } else if (typeof window.getISO2 === 'function') {
    iso2 = window.getISO2({
      ISO_A2: props.iso2?._value,
      ISO_A3: props.iso3?._value,
      name: name
    });
  }
  
  if (!iso2 && typeof window.guessISO2FromName === 'function') {
    iso2 = window.guessISO2FromName(name);
  }
  
  console.log(`🔍 ISO2 kodu: ${iso2}`);
  
  // Panel'i göster
  const panel = document.getElementById('info');
  if (panel) panel.style.display = 'block';
  
  // Türkçe ismi al
  let turkishName = name;
  if (typeof window.getCountryNameTurkish === 'function') {
    turkishName = window.getCountryNameTurkish(name);
  }
  
  // ÖNEMLİ: API'lerden gerçek veri çek (script.js'deki fonksiyon)
  if (iso2 && typeof window.loadCountryDataSmart === 'function') {
    window.loadCountryDataSmart(iso2, turkishName);
    console.log('✅ 3D modda API\'lerden veri çekiliyor...');
  } else {
    console.warn('⚠️ API yükleyici bulunamadı veya ISO2 yok');
    // Fallback olarak geçici veri göster
    openInfoPanelFallback(props, turkishName, iso2);
  }
  
  // Önceki seçimi temizle
  if (selectedEntity && selectedEntity.polygon) {
    const oldColor = selectedEntity.properties.originalColor._value;
    selectedEntity.polygon.material = oldColor.withAlpha(0.7);
    selectedEntity.polygon.outlineWidth = 1;
  }
  
  // Yeni seçimi vurgula
  if (entity.polygon) {
    const color = props.originalColor._value;
    entity.polygon.material = color.withAlpha(0.95);
    entity.polygon.outlineColor = Cesium.Color.WHITE;
    entity.polygon.outlineWidth = 3;
  }
  
  selectedEntity = entity;
  
  // Ülkeye yakınlaştır
  zoomToCountry(entity);
}

// ========================================
// FALLBACK PANEL (API'LER ÇALIŞMAZSA)
// ========================================

function openInfoPanelFallback(props, name, iso2) {
  const panel = document.getElementById('info');
  if (!panel) return;
  
  panel.style.display = 'block';
  
  // Temel bilgileri göster
  document.getElementById('country-name').textContent = name || 'Bilinmeyen Ülke';
  document.getElementById('pop').textContent = '—';
  document.getElementById('gdp').textContent = '—';
  document.getElementById('score').textContent = '—';
  
  // Bayrak göster
  const flag = document.getElementById('flag');
  if (flag && iso2) {
    flag.src = `https://flagcdn.com/w40/${iso2}.png`;
    flag.style.display = 'inline-block';
  }
  
  // Yükleme mesajı
  document.getElementById('water-text').innerHTML = `
    <div style="text-align:center; padding:20px;">
      <div style="font-size:40px; margin-bottom:10px;">🌐</div>
      <p style="margin:5px 0;"><strong>Veri yükleniyor...</strong></p>
      <p style="font-size:12px; color:#666;">World Bank • Wikipedia • FAO AQUASTAT</p>
    </div>
  `;
  
  console.log('⚠️ Fallback panel kullanıldı (3D mod)');
  
  // Geçici grafikler göster
  if (typeof window.renderTemporaryCharts === 'function') {
    window.renderTemporaryCharts(name);
  }
}

// ========================================
// YAKINLAŞTIRMA SİSTEMİ
// ========================================

function zoomToCountry(entity) {
  try {
    // Ülkenin sınırlarını al
    const positions = entity.polygon.hierarchy._value.positions;
    
    if (!positions || positions.length < 3) {
      console.warn('⚠️ Yakınlaştırma için yeterli koordinat yok');
      return;
    }
    
    // Bounding sphere hesapla
    const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
    
    // Ülke boyutuna göre mesafe hesapla
    const radius = boundingSphere.radius;
    let distance = radius * 3.5; // Ülkenin 3.5 katı mesafeden bak
    
    // Minimum ve maksimum mesafe sınırları
    distance = Math.max(500000, Math.min(distance, 5000000)); // 500km - 5000km arası
    
    // Kamera açısı ve yönelim
    const heading = 0;
    const pitch = Cesium.Math.toRadians(-45); // 45° yukarıdan
    const roll = 0;
    
    // Animasyonlu yakınlaştırma
    viewer.camera.flyToBoundingSphere(boundingSphere, {
      duration: 2.0,
      offset: new Cesium.HeadingPitchRange(heading, pitch, distance)
    });
    
    console.log(`✈️ Yakınlaştırma: ${(distance/1000).toFixed(0)}km mesafeden`);
    
  } catch (error) {
    console.warn('⚠️ Yakınlaştırma hatası:', error.message);
    // Hata olursa basit yakınlaştırma
    viewer.flyTo(entity, {
      duration: 2.0,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 2000000)
    });
  }
}

// ========================================
// HOVER İŞLEMİ
// ========================================

let hoveredEntity = null;

function handleCountryHover(entity) {
  if (entity === selectedEntity) return;
  if (entity === hoveredEntity) return;
  
  // Önceki hover'ı temizle
  resetHover();
  
  // Yeni hover
  if (entity.polygon) {
    const color = entity.properties.originalColor._value;
    entity.polygon.material = color.withAlpha(0.85);
    entity.polygon.outlineWidth = 2;
    hoveredEntity = entity;
  }
}

function resetHover() {
  if (hoveredEntity && hoveredEntity !== selectedEntity && hoveredEntity.polygon) {
    const color = hoveredEntity.properties.originalColor._value;
    hoveredEntity.polygon.material = color.withAlpha(0.7);
    hoveredEntity.polygon.outlineWidth = 1;
    hoveredEntity = null;
  }
}

// ========================================
// RESET FONKSİYONU
// ========================================

window.resetInfo = function() {
  const panel = document.getElementById('info');
  if (panel) panel.style.display = 'none';
  
  // Seçimi temizle
  if (selectedEntity && selectedEntity.polygon) {
    const color = selectedEntity.properties.originalColor._value;
    selectedEntity.polygon.material = color.withAlpha(0.7);
    selectedEntity.polygon.outlineWidth = 1;
    selectedEntity = null;
  }
  
  // 3D modda kamerayı dünya görünümüne döndür
  if (viewer && currentMode === '3d') {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(30, 30, 20000000),
      duration: 2.0,
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0
      }
    });
    console.log('🌐 Kamera dünya görünümüne döndü');
  }
  
  // Bilgileri sıfırla
  const elements = {
    'country-name': 'Dünya Su Kaynakları',
    'pop': '—',
    'gdp': '—',
    'score': '—',
    'water-text': 'Bir ülkeye tıklayarak bilgi alın.'
  };
  
  Object.keys(elements).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = elements[id];
  });
  
  const flag = document.getElementById('flag');
  if (flag) flag.style.display = 'none';
  
  console.log('✅ Panel sıfırlandı');
}

// ========================================
// BAŞLATMA
// ========================================

// Periyodik senkronizasyon timer'ı
let syncInterval = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    switchTo2D();
    console.log('✅ Sayfa yüklendi, 2D aktif');
    
    // 3D yüklendiğinde periyodik senkronizasyon başlat
    syncInterval = setInterval(() => {
      if (window.viewer && window.waterScoreData && currentMode === '3d') {
        syncScoresFrom2D();
      }
    }, 5000); // Her 5 saniyede bir kontrol et
  });
} else {
  switchTo2D();
  console.log('✅ 2D aktif');
  
  // Periyodik senkronizasyon
  syncInterval = setInterval(() => {
    if (window.viewer && window.waterScoreData && currentMode === '3d') {
      syncScoresFrom2D();
    }
  }, 5000);
}
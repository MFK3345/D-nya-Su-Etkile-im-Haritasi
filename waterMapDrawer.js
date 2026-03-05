// ========================================
// SU HARİTASI ÇİZİM SİSTEMİ
// ========================================

class WaterMapDrawer {
  constructor(canvasId, width = 420, height = 600) {
    this.canvas = document.getElementById(canvasId);
    
    if (!this.canvas) {
      console.error(`❌ Canvas bulunamadı: ${canvasId}`);
      return;
    }
    
    // Yüksek çözünürlük için 2x çarpan
    const scale = 2;
    this.ctx = this.canvas.getContext('2d');
    this.width = width;
    this.height = height;
    
    // Canvas gerçek boyutu (yüksek çözünürlük)
    this.canvas.width = width * scale;
    this.canvas.height = height * scale;
    
    // CSS boyutu (görüntüleme)
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
    
    // Scale uygula
    this.ctx.scale(scale, scale);
    
    console.log(`✅ WaterMapDrawer hazır: ${width}x${height}`);
  }

  // ========================================
  // ANA ÇİZİM - GRID STILI
  // ========================================
  
  drawWaterMap(countryData) {
    if (!this.ctx) return;
    
    const { bolgeler } = countryData.waterData;
    
    if (!bolgeler || bolgeler.length === 0) {
      this.drawNoData(countryData.name);
      return;
    }
    
    // Temiz arka plan
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Başlık
    this.drawTitle(countryData.name);
    
    // Bölgeleri grid olarak çiz
    this.drawRegionsGrid(bolgeler);
    
    // Lejant
    this.drawLegend();
    
    console.log(`✅ ${countryData.name} su haritası çizildi`);
  }

  // ========================================
  // BAŞLIK
  // ========================================
  
  drawTitle(countryName) {
    this.ctx.fillStyle = '#0f172a';
    this.ctx.font = 'bold 22px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${countryName}`, this.width / 2, 35);
    
    this.ctx.font = '14px Arial, sans-serif';
    this.ctx.fillStyle = '#64748b';
    this.ctx.fillText('Bölgesel Su Dağılımı', this.width / 2, 55);
  }

  // ========================================
  // BÖLGE GRID ÇİZİMİ
  // ========================================
  
  drawRegionsGrid(bolgeler) {
    const cols = 2;
    const rows = Math.ceil(bolgeler.length / cols);
    
    const startY = 75;
    const gridHeight = this.height - startY - 55;
    
    const boxWidth = (this.width - 50) / cols;
    const boxHeight = Math.min(130, gridHeight / rows); // 130px yükseklik
    
    bolgeler.forEach((bolge, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      const x = 25 + col * boxWidth;
      const y = startY + row * (boxHeight + 12);
      
      this.drawRegionBox(x, y, boxWidth - 15, boxHeight - 5, bolge);
    });
  }

  // ========================================
  // BÖLGE KUTUSU
  // ========================================
  
  drawRegionBox(x, y, width, height, bolge) {
    const { isim, yagis, nehirler, barajlar, risk } = bolge;
    
    // Risk rengi
    const colors = {
      'dusuk': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
      'orta': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
      'yuksek': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' }
    };
    
    const color = colors[risk] || colors['orta'];
    
    // Arka plan
    this.ctx.fillStyle = color.bg;
    this.ctx.fillRect(x, y, width, height);
    
    // Kenarlık
    this.ctx.strokeStyle = color.border;
    this.ctx.lineWidth = 2.5;
    this.ctx.strokeRect(x, y, width, height);
    
    // Bölge adı - DAHA BÜYÜK
    this.ctx.fillStyle = color.text;
    this.ctx.font = 'bold 15px Arial, sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(isim, x + 14, y + 24);
    
    // Bilgiler - DAHA BÜYÜK
    this.ctx.font = '13px Arial, sans-serif';
    this.ctx.fillStyle = '#1e293b';
    
    // Yağış
    this.ctx.fillText(`💧 ${yagis} mm/yıl`, x + 14, y + 46);
    
    // Nehirler
    if (nehirler && nehirler.length > 0) {
      this.ctx.fillText(`🌊 ${nehirler.length} nehir`, x + 14, y + 66);
    }
    
    // Barajlar
    if (barajlar && barajlar.length > 0) {
      this.ctx.fillText(`🏗️ ${barajlar.length} baraj`, x + 14, y + 86);
    }
  }

  // ========================================
  // LEJANT
  // ========================================
  
  drawLegend() {
    const y = this.height - 32;
    
    this.ctx.font = 'bold 13px Arial, sans-serif';
    this.ctx.fillStyle = '#475569';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Risk Seviyesi:', 30, y);
    
    // Düşük
    this.ctx.fillStyle = '#10b981';
    this.ctx.fillRect(130, y - 13, 20, 15);
    this.ctx.fillStyle = '#475569';
    this.ctx.font = '12px Arial, sans-serif';
    this.ctx.fillText('Düşük', 155, y);
    
    // Orta
    this.ctx.fillStyle = '#f59e0b';
    this.ctx.fillRect(210, y - 13, 20, 15);
    this.ctx.fillStyle = '#475569';
    this.ctx.fillText('Orta', 235, y);
    
    // Yüksek
    this.ctx.fillStyle = '#ef4444';
    this.ctx.fillRect(285, y - 13, 20, 15);
    this.ctx.fillStyle = '#475569';
    this.ctx.fillText('Yüksek', 310, y);
  }

  // ========================================
  // VERİ YOK MESAJI
  // ========================================
  
  drawNoData(countryName) {
    // Arka plan
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#f1f5f9');
    gradient.addColorStop(1, '#e2e8f0');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Mesaj
    this.ctx.fillStyle = '#64748b';
    this.ctx.font = 'bold 20px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${countryName}`, this.width / 2, this.height / 2 - 25);
    
    this.ctx.font = '15px Arial, sans-serif';
    this.ctx.fillText('Su haritası verisi', this.width / 2, this.height / 2 + 5);
    this.ctx.fillText('henüz eklenmedi', this.width / 2, this.height / 2 + 25);
    
    console.log(`⚠️ ${countryName} için veri yok`);
  }

  // ========================================
  // ALTERNATİF: DAİRESEL STİL
  // ========================================
  
  drawCircleStyle(countryData) {
    if (!this.ctx) return;
    
    const { bolgeler } = countryData.waterData;
    
    if (!bolgeler || bolgeler.length === 0) {
      this.drawNoData(countryData.name);
      return;
    }
    
    // Arka plan
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#dbeafe');
    gradient.addColorStop(1, '#bfdbfe');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Başlık
    this.ctx.fillStyle = '#1e40af';
    this.ctx.font = 'bold 20px Arial, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(countryData.name, this.width / 2, 40);
    
    this.ctx.font = '13px Arial, sans-serif';
    this.ctx.fillStyle = '#3b82f6';
    this.ctx.fillText('Bölgesel Yağış Dağılımı (mm/yıl)', this.width / 2, 60);
    
    // Dairesel yerleşim
    const centerX = this.width / 2;
    const centerY = this.height / 2 + 20;
    const radius = Math.min(this.width, this.height) / 3.5;
    
    bolgeler.forEach((bolge, index) => {
      const angle = (index / bolgeler.length) * 2 * Math.PI - Math.PI / 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      // Risk rengi
      const colors = {
        'dusuk': '#10b981',
        'orta': '#f59e0b',
        'yuksek': '#ef4444'
      };
      
      const color = colors[bolge.risk] || '#94a3b8';
      
      // Daire
      this.ctx.beginPath();
      this.ctx.arc(x, y, 35, 0, 2 * Math.PI);
      this.ctx.fillStyle = color;
      this.ctx.fill();
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
      
      // Yağış değeri
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 13px Arial, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${bolge.yagis}`, x, y + 5);
      
      // Bölge adı
      const labelX = centerX + Math.cos(angle) * (radius + 55);
      const labelY = centerY + Math.sin(angle) * (radius + 55);
      this.ctx.fillStyle = '#1e293b';
      this.ctx.font = '11px Arial, sans-serif';
      this.ctx.fillText(bolge.isim, labelX, labelY);
    });
    
    console.log(`✅ ${countryData.name} dairesel harita çizildi`);
  }
}

// ========================================
// GLOBAL FONKSİYON
// ========================================

window.drawCountryWaterMap = function(canvasId, countryData, style = 'grid', customWidth = null) {
  // Panel genişliğine göre otomatik boyut
  const width = customWidth || 420;
  const height = 600;
  
  const drawer = new WaterMapDrawer(canvasId, width, height);
  
  if (!drawer.ctx) {
    console.error('❌ Canvas oluşturulamadı');
    return null;
  }
  
  if (style === 'circle') {
    drawer.drawCircleStyle(countryData);
  } else {
    drawer.drawWaterMap(countryData);
  }
  
  return drawer;
};

console.log('✅ WaterMapDrawer sistemi yüklendi');
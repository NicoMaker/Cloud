// =============================================
//  CARICAMENTO DATI AZIENDA DA JSON
// =============================================

async function loadCompanyInfo() {
  try {
    const response = await fetch('/config.json');
    if (!response.ok) {
      throw new Error('Impossibile caricare config.json');
    }
    const config = await response.json();
    
    const company = config.company;
    const app = config.app;
    
    // Aggiorna nome azienda nel footer
    const companyNameElements = document.querySelectorAll('#footerCompanyName');
    companyNameElements.forEach(el => {
      if (el) el.textContent = company.name;
    });
    
    // Aggiorna P.IVA e indirizzo
    const vatElements = document.querySelectorAll('#footerVat');
    vatElements.forEach(el => {
      if (el) el.textContent = company.vat;
    });
    
    const addressElements = document.querySelectorAll('#footerAddress');
    addressElements.forEach(el => {
      if (el) el.textContent = company.address;
    });
    
    // Aggiorna informazioni nel login
    const companyNameLogin = document.getElementById('companyName');
    if (companyNameLogin) companyNameLogin.textContent = company.name;
    
    const companyVatLogin = document.getElementById('companyVat');
    if (companyVatLogin) companyVatLogin.textContent = company.vat;
    
    const companyAddressLogin = document.getElementById('companyAddress');
    if (companyAddressLogin) companyAddressLogin.textContent = company.address;
    
    // Aggiorna titolo pagina
    const titleElement = document.querySelector('title');
    if (titleElement && app.name) {
      if (!titleElement.textContent.includes(app.name)) {
        titleElement.textContent = `${app.name} - ${titleElement.textContent}`;
      }
    }
    
    console.log('Info azienda caricate:', company.name);
  } catch (error) {
    console.error('Errore nel caricamento delle info azienda:', error);
    // Dati di fallback
    const fallbackElements = document.querySelectorAll('#footerCompanyName, #companyName');
    fallbackElements.forEach(el => {
      if (el) el.textContent = 'Gestore File Sicuro S.r.l.';
    });
    
    const vatFallback = document.querySelectorAll('#footerVat, #companyVat');
    vatFallback.forEach(el => {
      if (el) el.textContent = 'IT12345678901';
    });
    
    const addressFallback = document.querySelectorAll('#footerAddress, #companyAddress');
    addressFallback.forEach(el => {
      if (el) el.textContent = 'Via Roma, 123 - 00184 Roma';
    });
  }
}

// Gestione errori di caricamento logo
function setupLogoFallback() {
  const logos = document.querySelectorAll('img[src="img/Logo.png"]');
  logos.forEach(img => {
    img.onerror = function() {
      console.log('Logo non trovato, utilizzo icona di fallback');
      this.style.display = 'none';
      // Cerca l'icona di fallback accanto
      const parent = this.parentElement;
      const fallbackIcon = parent.querySelector('.fa-shield-alt, .navbar-brand .fa-shield-alt');
      if (fallbackIcon) {
        fallbackIcon.style.display = 'inline-block';
      }
    };
  });
}

// Avvia il caricamento quando il DOM è pronto
document.addEventListener('DOMContentLoaded', () => {
  loadCompanyInfo();
  setupLogoFallback();
});
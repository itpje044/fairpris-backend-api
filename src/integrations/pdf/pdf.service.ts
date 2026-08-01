import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import type { AgreementPdfPayloadDto } from '../../api/dtos/agreement.dto';

export const generateAgreementPdf = async (data: AgreementPdfPayloadDto): Promise<Buffer> => {
  let browser;
  try {
    let logoBase64 = '';
    try {
      const logoPath = path.join(process.cwd(), 'public', 'assets', 'logo.png');
      const logoBuffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    } catch (err) {
    }

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    // Fairpris Aftalebekræftelse HTML Template
    const htmlContent = `
<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fairpris ApS - Aftalebekræftelse</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary-green: #4C8A53;
      --primary-dark: #2A3330;
      --text-color: #262626;
      --bg-viewer: #f0f2f5;
      --page-width: 210mm;
      --page-height: 297mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Calibri', 'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-viewer);
      color: var(--text-color);
      line-height: 1.4;
      font-size: 13.5px;
      -webkit-font-smoothing: antialiased;
    }

    /* Screen Viewer UI (Hidden in Print) */
    .viewer-header {
      background: #23272a;
      color: #fff;
      padding: 12px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }

    .viewer-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 16px;
      font-weight: 600;
      color: #e2e8f0;
    }

    .viewer-badge {
      background: #3a3f44;
      color: #a0aec0;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 400;
    }

    .print-btn {
      background: var(--primary-green);
      color: white;
      border: none;
      padding: 9px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: background 0.2s ease, transform 0.1s;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.15);
    }

    .print-btn:hover {
      background: #3d7043;
      transform: translateY(-1px);
    }

    .print-btn:active {
      transform: translateY(0);
    }

    .document-container {
      padding: 40px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 40px;
    }

    /* A4 Page Layout */
    .page {
      width: var(--page-width);
      height: var(--page-height);
      background: white;
      padding: 22mm 25mm 15mm 25mm;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      margin: 0 auto;
    }

    /* Content Styling */
    .page-content {
      flex: 1;
    }

    /* Page 1 Top Header */
    .top-logo {
      text-align: center;
      margin-top: 10px;
      margin-bottom: 45px;
    }

    .top-logo img {
      height: 54px;
      width: auto;
    }

    .title-block {
      margin-bottom: 38px;
      line-height: 1.35;
    }

    .doc-title {
      font-size: 19px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 4px;
    }

    .company-name {
      font-size: 17px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 2px;
    }

    .company-detail {
      font-size: 15px;
      color: var(--text-color);
    }

    /* Section Styling */
    .section {
      margin-bottom: 25px;
    }

    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 12px;
    }

    .paragraph {
      margin-bottom: 16px;
      line-height: 1.55;
    }

    .paragraph:last-child {
      margin-bottom: 0;
    }

    /* Numbered Sections (Pages 2-3) */
    .numbered-section {
      margin-bottom: 25px;
    }

    .num-heading {
      display: flex;
      gap: 35px;
      font-weight: 700;
      font-size: 15px;
      color: #1a1a1a;
      margin-bottom: 16px;
    }

    .num-content {
      padding-left: 0;
    }

    .field-line {
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .sub-heading-line {
      margin-top: 16px;
      margin-bottom: 8px;
      font-weight: 700;
    }

    .placeholder {
      color: inherit;
    }

    /* Products Section */
    .product-block {
      margin-bottom: 18px;
    }

    .product-header {
      font-weight: 400;
      margin-bottom: 6px;
    }

    .product-note {
      font-weight: 400;
    }

    .product-note.italic {
      font-style: italic;
    }

    .product-line {
      margin-top: 3px;
      margin-bottom: 2px;
    }

    .product-line.bold {
      font-weight: 700;
    }

    /* Lists on Page 3 */
    .bullet-list {
      list-style-type: disc;
      margin-left: 28px;
      margin-top: 12px;
      margin-bottom: 22px;
    }

    .bullet-list li {
      margin-bottom: 4px;
      padding-left: 4px;
    }

    .check-list {
      margin-top: 12px;
      padding-left: 20px;
    }

    .check-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .check-icon {
      font-weight: bold;
      font-size: 15px;
      color: var(--text-color);
      user-select: none;
    }

    /* Page 4 Contact Section */
    .contact-block {
      margin-top: 20px;
      margin-bottom: 35px;
      line-height: 1.5;
    }

    .link-blue {
      color: #0044ff;
      text-decoration: underline;
    }

    /* Footer Styling */
    .page-footer {
      width: 100%;
      margin-top: auto;
    }

    .footer-legal {
      text-align: center;
      font-size: 12px;
      color: #2b2b2b;
      margin-bottom: 30px;
      line-height: 1.5;
    }

    .footer-bottom {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: flex-end;
      width: 100%;
    }

    .footer-spacer {
      /* Placeholder for symmetrical grid */
    }

    .footer-logo-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .footer-icon-crop {
      width: 46px;
      height: 46px;
      overflow: hidden;
      position: relative;
      border-radius: 50%;
    }

    .footer-icon-crop img {
      height: 46px;
      width: auto;
      position: absolute;
      left: 0;
      top: 0;
      max-width: none;
    }

    .footer-logo-text {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.6px;
      color: #2b3531;
      font-family: Arial, sans-serif;
      text-transform: uppercase;
    }

    .page-number {
      text-align: right;
      font-size: 13px;
      color: #2b2b2b;
      margin-bottom: 6px;
    }

    /* Responsive Adaptation for small screen preview */
    @media screen and (max-width: 850px) {
      .document-container {
        padding: 20px 10px;
        gap: 25px;
      }
      .page {
        width: 100%;
        height: auto;
        min-height: 1100px;
        padding: 40px 25px;
      }
    }

    /* Print Specific Styling */
    @media print {
      @page {
        size: A4;
        margin: 0;
      }
      
      body {
        background: transparent !important;
        padding: 0 !important;
        margin: 0 !important;
        color: #000 !important;
      }
      
      .viewer-header, .no-print {
        display: none !important;
      }
      
      .document-container {
        padding: 0 !important;
        gap: 0 !important;
      }
      
      .page {
        box-shadow: none !important;
        margin: 0 !important;
        width: 210mm !important;
        height: 297mm !important;
        padding: 22mm 25mm 15mm 25mm !important;
        page-break-after: always !important;
        page-break-inside: avoid !important;
      }

      .page:last-child {
        page-break-after: auto !important;
      }
    }
  </style>
</head>
<body>

  <!-- Top bar visible only when viewing in browser -->
  <header class="viewer-header no-print">
    <div class="viewer-title">
      <span>📄 Fairpris ApS - Aftalebekræftelse</span>
      <span class="viewer-badge">HTML Template (4 Pages)</span>
    </div>
    <button class="print-btn" onclick="window.print()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print / Save as PDF
    </button>
  </header>

  <main class="document-container">

    <!-- ================= PAGE 1 ================= -->
    <div class="page">
      <div class="page-content">
        <div class="top-logo">
          <img src="${logoBase64}" alt="FAIRPRIS Logo">
        </div>

        <div class="title-block">
          <div class="doc-title">Aftalebekræftelse - levering af elektricitet</div>
          <div class="company-name">Fairpris ApS</div>
          <div class="company-detail">CVR-nr. 43658328</div>
          <div class="company-detail">Købmagergade 3, 1. sal</div>
          <div class="company-detail">1150 København K</div>
        </div>

        <div class="section">
          <div class="section-title">Vigtigt</div>
          <p class="paragraph">
            Denne aftale indeholder de konkrete oplysninger om din elaftale med Fairpris ApS. De 
            dokumenter, som du har modtaget og accepteret i forbindelse med bestillingen, herunder Salgs- 
            og leveringsbetingelser, Privatlivspolitik, Cookiepolitik samt den gældende prisliste for gebyrer, 
            udgør en integreret del af aftalen. Vi anbefaler, at du gemmer dette dokument til senere brug.
          </p>
        </div>

        <div class="section">
          <div class="section-title">Aftalebekræftelse</div>
          <p class="paragraph">
            Denne aftale er indgået mellem Fairpris ApS ("Fairpris") og nedenstående kunde vedrørende 
            levering af elektricitet.
          </p>
          <p class="paragraph">
            Dokumentet udgør den officielle aftalebekræftelse og indeholder de konkrete oplysninger om den 
            aftale, der er indgået mellem parterne.
          </p>
          <p class="paragraph">
            Ved kundens digitale underskrift bekræftes de oplysninger, der fremgår af denne aftale, samt de 
            dokumenter, der indgår som en del af aftalegrundlaget.
          </p>
        </div>
      </div>

      <div class="page-footer">
        <div class="footer-legal">
          <strong>Fairpris ApS</strong> / Købmagergade 3, 1. sal / 1150 København K<br>
          CVR-nr. DK43658328 / Tlf. 24 460 460 / Web: www.fairpris.dk / Mail: <a href="mailto:hej@fairpris.dk" class="link-blue">hej@fairpris.dk</a>
        </div>
        <div class="footer-bottom">
          <div class="footer-spacer"></div>
          <div class="footer-logo-wrapper">
            <div class="footer-icon-crop">
              <img src="${logoBase64}" alt="Fairpris Icon">
            </div>
            <div class="footer-logo-text">FAIRPRIS</div>
          </div>
          <div class="page-number">1/4</div>
        </div>
      </div>
    </div>

    <!-- ================= PAGE 2 ================= -->
    <div class="page">
      <div class="page-content">
        <div class="numbered-section">
          <div class="num-heading">
            <span class="num">1.</span>
            <span class="title">Aftaleoversigt</span>
          </div>
          <div class="num-content">
            <div class="field-line">Dokumentdato: <span class="placeholder">${data.documentDate || 'Dags dato'}</span></div>
            <div class="field-line">Navn: <span class="placeholder">${data.firstName} ${data.lastName}</span></div>
            <div class="field-line">CPR: <span class="placeholder">${data.cprNumber}</span></div>
            <div class="field-line">Telefon: <span class="placeholder">${data.phone}</span></div>
            <div class="field-line">E-mail: <span class="placeholder">${data.email}</span></div>
            <div class="field-line">Betalingsform: <span class="placeholder">${data.paymentMethod || 'Betalingsservice / Kort'}</span></div>
            <div class="field-line">GSRN-nummer: <span class="placeholder">${data.gsrnNumber || '---------'}</span></div>
            
            <div class="sub-heading-line">Leveringssted:</div>
            <div class="field-line">Adresse: <span class="placeholder">${data.address}, ${data.zipCode} ${data.city}</span></div>
            <div class="field-line">Ønsket leveringsstart: <span class="placeholder">${data.moveInDate || data.startDate || 'Hurtigst muligt'}</span></div>
          </div>
        </div>

        <div class="numbered-section" style="margin-top: 25px;">
          <div class="num-heading">
            <span class="num">2.</span>
            <span class="title">Dine valgte produkter</span>
          </div>
          <div class="num-content">
${data.selectedProduct?.toLowerCase().includes('flex') ? `            <div class="product-block">
              <div class="product-header">FAIR Flex</div>
              <div class="product-line">Tillæg pr. kWh</div>
              <div class="placeholder">${data.productMargin || '0,00'}</div>
              <div class="product-line bold">Månedligt abonnement</div>
              <div class="placeholder">${data.productSubscription || '0,00'}</div>
              <div class="product-line">Handels- og balancetillæg pr. kWh</div>
              <div class="placeholder">${data.balanceFee || '0,00'}</div>
            </div>` : ''}
${data.selectedProduct?.toLowerCase().includes('abonnement') ? `
            <div class="product-block">
              <div class="product-header">FAIR Abonnement</div>
              <div class="product-line">Tillæg pr. kWh</div>
              <div class="placeholder">${data.subPrice || '0,00'}</div>
              <div class="product-line bold">Månedligt abonnement</div>
              <div class="placeholder">${data.subMargin || '0,00'}</div>
              <div class="product-line">Handels- og balancetillæg pr. kWh</div>
              <div class="placeholder">${data.balanceFee || '0,00'}</div>
            </div>` : ''}
${data.selectedProduct?.toLowerCase().includes('produktion') ? `
            <div class="product-block" style="margin-bottom: 0;">
              <div class="product-header">FAIR Produktion</div>
              <div class="product-line">Tillæg pr. kWh</div>
              <div class="placeholder">${data.prodMargin || '0,00'}</div>
              <div class="product-line bold">Månedligt abonnement</div>
              <div class="placeholder">${data.prodSubscription || '0,00'}</div>
              <div class="product-line">Handels- og balancetillæg pr. kWh</div>
              <div class="placeholder">${data.balanceFee || '0,00'}</div>
            </div>` : ''}
          </div>
        </div>
      </div>

      <div class="page-footer">
        <div class="footer-bottom">
          <div class="footer-spacer"></div>
          <div class="footer-logo-wrapper">
            <div class="footer-icon-crop">
              <img src="${logoBase64}" alt="Fairpris Icon">
            </div>
            <div class="footer-logo-text">FAIRPRIS</div>
          </div>
          <div class="page-number">2/4</div>
        </div>
      </div>
    </div>

    <!-- ================= PAGE 3 ================= -->
    <div class="page">
      <div class="page-content">
        <div class="numbered-section">
          <div class="num-heading" style="margin-bottom: 16px;">
            <span class="num">3.</span>
            <span class="title">Dit aftalegrundlag</span>
          </div>
          <div class="num-content">
            <p class="paragraph">Denne aftale består af:</p>
            
            <ul class="bullet-list">
              <li>denne aftalebekræftelse,</li>
              <li>Fairpris' Salgs- og leveringsbetingelser,</li>
              <li>Fairpris' Privatlivspolitik,</li>
              <li>Fairpris' Cookiepolitik,</li>
              <li>den gældende prisliste,</li>
              <li>samt eventuelle produktspecifikke vilkår.</li>
            </ul>
            
            <p class="paragraph" style="margin-bottom: 18px;">
              De ovenstående dokumenter udgør samlet aftalegrundlaget mellem kunden og Fairpris.
            </p>
            <p class="paragraph">
              De priser og tillæg, der fremgår ovenfor, er gældende ved aftalens indgåelse. Eventuelle fremtidige 
              prisændringer sker i overensstemmelse med Fairpris' Salgs- og leveringsbetingelser.
            </p>
          </div>
        </div>

        <div class="numbered-section" style="margin-top: 25px;">
          <div class="num-heading" style="margin-bottom: 18px;">
            <span class="num">4.</span>
            <span class="title">Ved din underskrift bekræfter du, at:</span>
          </div>
          <div class="num-content">
            <div class="check-list">
              <div class="check-item"><span class="check-icon">&#10003;</span> <span>Oplysningerne i denne aftale er korrekte.</span></div>
              <div class="check-item"><span class="check-icon">&#10003;</span> <span>Du ønsker at indgå aftale med Fairpris om de valgte produkter.</span></div>
              <div class="check-item"><span class="check-icon">&#10003;</span> <span>Du har modtaget oplysninger om priser, abonnement, tillæg og gebyrer inden aftalens indgåelse.</span></div>
              <div class="check-item"><span class="check-icon">&#10003;</span> <span>Du har modtaget og accepteret Fairpris' Salgs- og leveringsbetingelser.</span></div>
              <div class="check-item"><span class="check-icon">&#10003;</span> <span>Du har modtaget Fairpris' Privatlivspolitik.</span></div>
              <div class="check-item"><span class="check-icon">&#10003;</span> <span>Du har modtaget Fairpris' Cookiepolitik.</span></div>
              <div class="check-item"><span class="check-icon">&#10003;</span> <span>Fairpris må gennemføre leverandørskifte hos den relevante netvirksomhed.</span></div>
              <div class="check-item"><span class="check-icon">&#10003;</span> <span>Du er blevet informeret om din eventuelle fortrydelsesret.</span></div>
            </div>
          </div>
        </div>

        <div class="numbered-section" style="margin-top: 25px;">
          <div class="num-heading" style="margin-bottom: 16px;">
            <span class="num">5.</span>
            <span class="title">Markedsføringsvalg</span>
          </div>
          <div class="num-content">
            <p class="paragraph" style="margin-bottom: 14px;">Samtykke til markedsføring: <span class="placeholder">${data.marketingConsent || 'Ja / Nej'}</span></p>
            <p class="paragraph">Et eventuelt samtykke er frivilligt, påvirker ikke elaftalen og kan til enhver tid tilbagekaldes.</p>
          </div>
        </div>

        <div class="numbered-section" style="margin-top: 25px; margin-bottom: 0;">
          <div class="num-heading" style="margin-bottom: 16px;">
            <span class="num">6.</span>
            <span class="title">Digital underskrift</span>
          </div>
          <div class="num-content">
            <p class="paragraph" style="margin-bottom: 16px;">Denne aftale underskrives elektronisk via Penneo.</p>
            <p class="paragraph" style="margin-bottom: 16px;">Den digitale underskrift har samme juridiske gyldighed som en fysisk underskrift.</p>
            <p class="paragraph">Penneo registrerer og dokumenterer underskriftsforløbet, herunder underskriftstidspunkt og øvrige oplysninger, som fremgår af Penneos revisionslog.</p>
          </div>
        </div>
      </div>

      <div class="page-footer">
        <div class="footer-bottom">
          <div class="footer-spacer"></div>
          <div class="footer-logo-wrapper">
            <div class="footer-icon-crop">
              <img src="${logoBase64}" alt="Fairpris Icon">
            </div>
            <div class="footer-logo-text">FAIRPRIS</div>
          </div>
          <div class="page-number">3/4</div>
        </div>
      </div>
    </div>

    <!-- ================= PAGE 4 ================= -->
    <div class="page">
      <div class="page-content" style="padding-top: 15px;">
        <div class="section-title" style="margin-bottom: 25px; font-size: 16px;">Kontaktoplysninger</div>
        
        <p class="paragraph" style="margin-bottom: 30px;">
          Har du spørgsmål til din aftale eller dit kundeforhold, er du altid velkommen til at kontakte Fairpris.
        </p>
        
        <div class="contact-block">
          <div style="font-weight: 600; margin-bottom: 2px;">Fairpris ApS</div>
          <div>Købmagergade 3, 1. sal</div>
          <div>1150 København K</div>
          <div style="margin-bottom: 22px;">CVR-nr. 43658328</div>
          
          <div><strong>Telefon:</strong> +45 24 460 460</div>
          <div><strong>E-mail:</strong> hej@fairpris.dk</div>
          <div><strong>Hjemmeside:</strong> <a href="https://www.fairpris.dk" class="link-blue">www.fairpris.dk</a></div>
        </div>

        <p class="paragraph" style="margin-top: 35px;">
          Hvis du ønsker at læse mere om, hvordan Fairpris behandler personoplysninger, herunder hvilke 
          rettigheder du har efter databeskyttelseslovgivningen, henviser vi til Fairpris' Privatlivspolitik.
        </p>
      </div>

      <div class="page-footer">
        <div class="footer-bottom">
          <div class="footer-spacer"></div>
          <div class="footer-logo-wrapper">
            <div class="footer-icon-crop">
              <img src="${logoBase64}" alt="Fairpris Icon">
            </div>
            <div class="footer-logo-text">FAIRPRIS</div>
          </div>
          <div class="page-number">4/4</div>
        </div>
      </div>
    </div>

  </main>
</body>
</html>
    `;
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

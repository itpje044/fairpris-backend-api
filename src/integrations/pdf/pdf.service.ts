import puppeteer from 'puppeteer';
import type { PdfPayload } from '../../api/dtos/agreement.dto.js';

export const generateAgreementPdf = async (data: PdfPayload): Promise<Buffer> => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    // A very basic beautiful HTML template for the PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="da">
      <head>
        <meta charset="UTF-8">
        <title>Elleverandøraftale</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #4CAF50; padding-bottom: 20px; margin-bottom: 30px; }
          h1 { color: #4CAF50; }
          .section { margin-bottom: 20px; }
          .section h2 { font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
          .label { font-weight: bold; }
          .footer { margin-top: 50px; font-size: 12px; text-align: center; color: #777; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Fairpris Elleverandøraftale</h1>
          <p>Din pålidelige partner for strøm</p>
        </div>
        
        <div class="section">
          <h2>Kundeoplysninger</h2>
          <div class="row"><span class="label">Navn:</span> <span>${data.firstName} ${data.lastName}</span></div>
          <div class="row"><span class="label">CPR-nummer:</span> <span>${data.cprNumber}</span></div>
          <div class="row"><span class="label">Email:</span> <span>${data.email}</span></div>
          <div class="row"><span class="label">Telefon:</span> <span>${data.phone}</span></div>
        </div>

        <div class="section">
          <h2>Installationsadresse</h2>
          <div class="row"><span class="label">Adresse:</span> <span>${data.address}</span></div>
          <div class="row"><span class="label">Postnr & By:</span> <span>${data.zipCode} ${data.city}</span></div>
          <div class="row"><span class="label">Aftagenummer (GSRN):</span> <span>${data.gsrnNumber}</span></div>
        </div>

        <div class="section">
          <h2>Produktoplysninger</h2>
          <div class="row"><span class="label">Valgt Produkt:</span> <span>${data.selectedProduct}</span></div>
          ${data.moveInDate ? `<div class="row"><span class="label">Indflytningsdato:</span> <span>${data.moveInDate}</span></div>` : ''}
        </div>

        <div class="section">
          <h2>Vilkår og Betingelser (Terms & Conditions)</h2>
          <p style="font-size: 14px; line-height: 1.5; color: #555;">
            Ved underskrivelse af denne aftale bekræfter kunden at have læst og accepteret de gældende leveringsbetingelser for Fairpris. 
            Aftalen er bindende fra det tidspunkt, den signeres digitalt via Penneo. 
            Fairpris forpligter sig til at levere strøm til den angivne adresse i overensstemmelse med det valgte produkt.
          </p>
        </div>

        <div class="footer">
          Dette dokument er genereret automatisk og afventer digital signatur.
        </div>
      </body>
      </html>
    `;

    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

    // Calculate exact height of the content to remove the blank space at the bottom
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);

    const pdfBuffer = await page.pdf({
      width: '794px', // A4 width at 96 DPI
      height: `${bodyHeight}px`, // Dynamic height based on content
      printBackground: true
    });

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

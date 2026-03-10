const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const QRCode = require('qrcode');

const app = express();
const PORT = 3000;

async function fetchBaselWeather() {
  try {
    const apiKey = process.env.OWM_API_KEY || '493600bad3d40997d9514eb58565806d';
    const url = `https://api.openweathermap.org/data/2.5/weather?q=Basel,CH&units=metric&appid=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) return '';
    const data = await resp.json();
    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    return `${temp}°C ${desc} — Basel`;
  } catch (e) {
    console.error('Weather fetch failed:', e.message);
    return '';
  }
}
const WEBSITE_URL = 'https://github.com/mtnnnntm/SomeBody/releases/v1.0.0'; // change for production

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Thermal Printer Endpoint ---
app.post('/api/print', async (req, res) => {
  try {
    const timestamp = req.body.timestamp || new Date().toISOString();
    var captureImage = req.body.captureImage || null;
    var d = new Date(timestamp);
    var timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    var dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var fullTimestamp = timeStr + ' — ' + dateStr;

    // Read flyer template and inline images as base64 (temp file can't resolve relative paths)
    const templatePath = path.join(__dirname, 'print', 'flyer-template.html');
    let html = fs.readFileSync(templatePath, 'utf-8');

    const titleB64 = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'print', 'images', 'title.png')).toString('base64');
    const qrB64 = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'public', 'images', 'qrcode.jpg')).toString('base64');
    html = html.replace('src="images/title.png"', 'src="' + titleB64 + '"');
    html = html.replace('src="images/qrcode.jpg"', 'src="' + qrB64 + '"');

    html = html.replace('{{TIMESTAMP}}', fullTimestamp);
    html = html.replace('{{WEBSITE_URL}}', WEBSITE_URL);

    // Embed webcam capture + penalty message if present
    if (captureImage) {
      console.log('Received webcam capture (' + Math.round(captureImage.length / 1024) + 'kb)');
      html = html.replace('<!-- {{CAPTURE_SECTION}} -->',
        '<div class="msg">You are too close to me!!</div>'
        + '<div class="from">from: PosturePolice</div>'
        + '<img class="capture" src="' + captureImage + '">'
        + '<div class="divider">__ _ __ _ __ _ __ _ __ _ __ _ __ _ __ _ __ _ __ _ __ _ __</div>');
    } else {
      html = html.replace('<!-- {{CAPTURE_SECTION}} -->', '');
    }

    // Write temp HTML, convert to PDF via headless Chrome, then print
    const tmpBase = path.join(require('os').tmpdir(), `flyer-${Date.now()}`);
    const tmpHtml = tmpBase + '.html';
    const tmpPdf = tmpBase + '.pdf';
    fs.writeFileSync(tmpHtml, html);

    const chrome = '/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome';
    const pdfCmd = `${chrome} --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${tmpPdf}" --print-to-pdf-no-header "file://${tmpHtml}"`;

    exec(pdfCmd, (pdfErr, pdfOut, pdfStderr) => {
      if (pdfErr) {
        console.error('PDF conversion failed:', pdfErr.message, pdfStderr);
        setTimeout(() => { try { fs.unlinkSync(tmpHtml); } catch(e) {} }, 5000);
        return res.status(500).json({ error: 'PDF conversion failed', detail: pdfErr.message });
      }

      const printCmd = `lp -d EPSON_TM_T88V_2 -o PageSize=RP80x297 -o TmtPaperReduction=Both -o fit-to-page "${tmpPdf}"`;
      exec(printCmd, (lpErr, lpOut, lpStderr) => {
        if (lpErr) {
          console.error('Print failed:', lpErr.message, lpStderr);
        } else {
          console.log('Sent to printer:', lpOut);
        }
        setTimeout(() => {
          try { fs.unlinkSync(tmpHtml); } catch(e) {}
          try { fs.unlinkSync(tmpPdf); } catch(e) {}
        }, 10000);
        if (lpErr) return res.status(500).json({ error: 'Print failed', detail: lpErr.message });
        res.json({ ok: true });
      });
    });
  } catch (err) {
    console.error('Print endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Browser Print Endpoint ---
app.get('/api/flyer', async (req, res) => {
  try {
    // Inline the title image as a base64 data URL
    const titlePath = path.join(__dirname, 'print', 'images', 'title.png');
    const titleBase64 = fs.readFileSync(titlePath).toString('base64');
    const titleDataURL = 'data:image/png;base64,' + titleBase64;

    var d = new Date();
    var timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    var dateStr = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var fullTimestamp = timeStr + ' — ' + dateStr;

    // Read and render flyer template
    const templatePath = path.join(__dirname, 'print', 'flyer-template.html');
    let html = fs.readFileSync(templatePath, 'utf-8');
    const qrPath = path.join(__dirname, 'public', 'images', 'qrcode.jpg');
    const qrDataURL = 'data:image/jpeg;base64,' + fs.readFileSync(qrPath).toString('base64');

    html = html.replace('{{TIMESTAMP}}', fullTimestamp);
    html = html.replace('src="images/title.png"', 'src="' + titleDataURL + '"');
    html = html.replace('src="images/qrcode.jpg"', 'src="' + qrDataURL + '"');
    html = html.replace('{{WEBSITE_URL}}', WEBSITE_URL);
    html = html.replace('<!-- {{CAPTURE_SECTION}} -->', '');

    // Append auto-print script
    html = html.replace('</body>', '<script>window.onload = function() { window.print(); }</script>\n</body>');

    res.send(html);
  } catch (err) {
    console.error('Flyer endpoint error:', err);
    res.status(500).send('Failed to render flyer');
  }
});

// Weather endpoint for the website
app.get('/api/weather', async (req, res) => {
  const weather = await fetchBaselWeather();
  res.json({ weather });
});

// Health check for online/offline detection
app.get('/api/health', (req, res) => {
  res.json({ ok: true, printer: true });
});

app.listen(PORT, () => {
  console.log(`Body Apps website running at http://localhost:${PORT}`);
});

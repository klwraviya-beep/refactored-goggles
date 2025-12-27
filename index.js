/*CREATOR : RIICODE*/
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');

const MIME_MAP = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", bmp: "image/bmp"
};

const DL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Android 15; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  Referer: "https://www.google.com/"
};

class GridPlus {
  constructor() {
    this.ins = axios.create({
      baseURL: "https://api.grid.plus/v1",
      headers: {
        "X-AppID": "808645",
        "X-Platform": "h5",
        "X-Version": "8.9.7",
        "X-UniqueID": this.uid(),
        "sig": `XX${this.uid()}${this.uid()}`
      }
    });
  }

  uid() { return crypto.randomUUID().replace(/-/g, ""); }

  form(dt) {
    const f = new FormData();
    Object.entries(dt ?? {}).forEach(([k, v]) => f.append(k, v));
    return f;
  }

  async up(buf, path) {
    const ext = "png"; 
    const mime = MIME_MAP[ext];
    const f = new FormData();
    f.append("file", buf, { filename: `file.${ext}`, contentType: mime });
    f.append("path", path);
    const d = await this.ins.post("/ai/nano/upload_file", f, { headers: { ...f.getHeaders(), "content-type": mime } });
    return d?.data?.img_url;
  }

  async poll({ path, sl }) {
    const start = Date.now();
    const check = async () => {
      // Extended timeout for serverless environments
      if (Date.now() - start > 60000) throw new Error("Neural Engine Timeout");
      const r = await this.ins.get(path);
      if (sl(r.data)) return r.data;
      await new Promise(res => setTimeout(res, 3000));
      return check();
    };
    return check();
  }

  async generate({ prompt, imageUrl }) {
    let requestData = { prompt };
    if (imageUrl) {
      const b64 = imageUrl.split(",")[1] || imageUrl;
      const buf = Buffer.from(b64, "base64");
      requestData.url = await this.up(buf, "wn_aistyle_nano");
    }
    const taskRes = await this.ins.post("/ai/nano/upload", this.form(requestData)).then(r => r?.data);
    if (!taskRes?.task_id) throw new Error("Task ID generation failed");
    return this.poll({
      path: `/ai/nano/get_result/${taskRes.task_id}`,
      sl: d => d?.code === 0 && !!d?.image_url
    });
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/grid-plus', async (req, res) => {
  try {
    const { prompt, imageUrl } = req.body;
    const engine = new GridPlus();
    const result = await engine.generate({ prompt, imageUrl });
    res.json(result);
  } catch (err) {
    console.error("Error generating image:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// IMPORTANT: Export for Vercel Deployment
module.exports = app; 

// Local Server Initialization
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Neural Core Active on Port ${PORT}`));
  }

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
    Object.entries(dt ?? {}).forEach(([k, v]) => { if (v != null) f.append(k, String(v)); });
    return f;
  }

  ext(buf) {
    const h = buf.subarray(0, 12).toString("hex");
    if (h.startsWith("ffd8ffe")) return "jpg";
    if (h.startsWith("89504e47")) return "png";
    return "png";
  }

  async up(buf, mtd) {
    const e = this.ext(buf);
    const mime = MIME_MAP[e] ?? "image/png";
    const d = await this.ins.post("/ai/web/nologin/getuploadurl", this.form({ ext: e, method: mtd })).then(r => r?.data);
    await axios.put(d.data.upload_url, buf, { headers: { "content-type": mime } });
    return d?.data?.img_url;
  }

  async poll({ path, sl }) {
    const start = Date.now();
    const check = async () => {
      if (Date.now() - start > 60000) throw new Error("Timeout");
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
app.use(express.static('public'));

app.post('/api/grid-plus', async (req, res) => {
  try {
    const api = new GridPlus();
    const result = await api.generate(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// For local testing
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => console.log("Server running on http://localhost:3000"));
}

module.exports = app;
# MagicRoute Backend

MagicRoute uygulamasının backend API'si.

## 🚀 Deployment

Bu proje Vercel'de ayrı bir proje olarak deploy edilir.

### Environment Variables

Vercel'de aşağıdaki environment variable'ları ayarlayın:

- `MONGODB_URI`: MongoDB Atlas connection string
- `MAPBOX_TOKEN`: Mapbox API token
- `NODE_ENV`: production

### API Endpoints

- `GET /api/orders` - Siparişleri listele
- `POST /api/orders` - Yeni sipariş ekle
- `PUT /api/orders/:id` - Sipariş güncelle
- `DELETE /api/orders/:id` - Sipariş sil
- `GET /api/customers` - Müşterileri listele
- `GET /api/analytics` - Analitik verileri

## 🔧 Local Development

```bash
npm install
npm start
```

Backend `http://localhost:5001` adresinde çalışacak. 
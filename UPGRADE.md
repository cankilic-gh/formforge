# FormForge - Upgrade Plan

**Analiz Tarihi:** 2026-02-16
**Tip:** Next.js + TypeScript + Zustand
**Domain:** Legal Form XML Editor

---

## Kritik Upgrades

### 1. @dnd-kit Migration
**Oncelik:** KRITIK
**Dosya:** `src/components/FormTree.tsx`

@dnd-kit yüklu ama kullanilmiyor. Native HTML5 drag accessibility eksik.

```bash
# Zaten yüklu:
# @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
```

**Gorev:**
- [ ] FormTree'yi @dnd-kit ile yeniden yaz
- [ ] Keyboard drag destegi ekle
- [ ] Touch device destegi
- [ ] Smooth animasyonlar

---

### 2. Toolbar Paste Implementasyonu
**Oncelik:** KRITIK
**Dosya:** `src/components/Toolbar.tsx` (satir 295)

"Coming Soon" placeholder kodu var.

**Gorev:**
- [ ] formStore copyNode ile tutarli hale getir
- [ ] Toolbar paste'i implement et
- [ ] JSON.stringify tutarsizligini duzelt

---

## Yuksek Oncelikli Upgrades

### 3. XML Builder Kod Tekrari
**Oncelik:** YUKSEK
**Dosya:** `src/lib/xmlParser.ts` (1154 satir)

buildXML ve buildSubformXML neredeyse identik.

**Gorev:**
- [ ] Shared helper fonksiyonlar cikart
- [ ] buildDescription, buildWarning, buildNote birlesitir
- [ ] DRY prensibi uygula

---

### 4. XML Inline Editor
**Oncelik:** YUKSEK

Read-only XML goruntuleme var, edit yok.

```bash
npm install @codemirror/lang-xml codemirror
# veya Monaco Editor
```

**Gorev:**
- [ ] CodeMirror 6 XML mode entegre et
- [ ] Edit + re-parse ozelligi ekle
- [ ] Syntax highlighting

---

### 5. Property Panel Eksik Tipler
**Oncelik:** YUKSEK
**Dosya:** `src/components/PropertyPanel.tsx`

description, warning, note, option, reference icin panel yok.

**Gorev:**
- [ ] Her node tipi icin property panel ekle
- [ ] Switch case genislet

---

## Orta Oncelikli Upgrades

### 6. Validation Genisletme
**Oncelik:** ORTA
**Dosya:** `src/components/ValidationStatus.tsx`

Sadece duplicate/bos ID kontrolu var.

**Gorev:**
- [ ] Required question'da description kontrolu
- [ ] Orphan conditionlogic referanslari
- [ ] ConditionSet'te trigger question kontrolu

---

### 7. AI Entegrasyonu
**Oncelik:** ORTA
**Dosya:** `src/components/SmartFormGenerator.tsx`

Regex-based pattern matching var.

```bash
npm install @vercel/ai
```

**Gorev:**
- [ ] Claude Haiku entegrasyonu
- [ ] Dogal dil alan tespiti
- [ ] Hukuki terminoloji destegi

---

### 8. AuthGuard Aktivasyonu
**Oncelik:** ORTA
**Dosya:** `src/components/AuthGuard.tsx`

Firebase Auth hazir ama kullanilmiyor.

**Gorev:**
- [ ] Multi-user collaboration planla
- [ ] AuthGuard'i page.tsx'e ekle
- [ ] Veya dead code'u sil

---

## Dusuk Oncelikli Upgrades

### 9. IndexedDB Persistence
**Oncelik:** DUSUK
**Dosya:** `src/stores/formStore.ts` (satir 1141-1162)

sessionStorage tab kapatinca kaybolur.

```bash
npm install idb-keyval
```

**Gorev:**
- [ ] Zustand persist'i IndexedDB'ye tasi
- [ ] Buyuk formlar icin daha iyi depolama

---

### 10. Law School Dropdown
**Oncelik:** DUSUK
**Dosya:** `src/components/FormPreview.tsx` (satir 481-489)

Sadece 4 hardcoded okul var.

**Gorev:**
- [ ] ABA-accredited tam liste ekle
- [ ] formData'dan dinamik oku

---

## Onerilen Teknolojiler

| Kategori | Kutuphane | Amac |
|----------|-----------|------|
| D&D | @dnd-kit (zaten yuklu) | Touch + keyboard drag |
| XML Edit | CodeMirror 6 | Syntax-highlighted editing |
| AI | Vercel AI SDK + Claude | Smart field detection |
| Persist | idb-keyval | IndexedDB wrapper |
| Test | Vitest | Unit testing |
| Rich Text | Tiptap veya Slate.js | Description editing |
| Shortcuts | react-hotkeys-hook | Ctrl+Z, Del, etc. |

---

## Tahmini Is Yukleri

| Upgrade | Zorluk |
|---------|--------|
| @dnd-kit Migration | Orta |
| Paste Fix | Kolay |
| XML Builder DRY | Orta |
| CodeMirror | Orta |
| Property Panels | Kolay |

<div align="center">

# FormForge

**Visual XML Form Builder for Bar Association Applications**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Zustand](https://img.shields.io/badge/Zustand-443E38?style=for-the-badge&logo=react&logoColor=white)](https://zustand-demo.pmnd.rs/)

[Live Demo](https://formforge.thegridbase.com) | [TheGridBase](https://github.com/cankilic-gh/thegridbase)

</div>

---

## Overview

FormForge is a powerful visual editor for creating and editing XML-based questionnaire forms used in Bar Association character and fitness applications. It provides a modern, intuitive interface for managing complex form structures without writing XML by hand.

## Features

### Core Functionality
- **Visual Tree Editor** - Drag-and-drop interface for building form hierarchy
- **20+ Question Types** - Text, radio, select, date, SSN, signature, and more
- **Conditional Logic** - AND/OR condition sets with multiple branches
- **Live Preview** - See how forms will appear to applicants
- **XML Import/Export** - Full compatibility with existing form XMLs

### Smart Tools
- **Smart Form Generator** - Paste field labels, auto-detect types
- **Address Set** - One-click to add complete address fields
- **Profile Reference** - Link to applicant profile data
- **Include Form** - Embed sub-forms
- **Required Documents** - Document upload requirements

### Quality Assurance
- **Real-time Validation** - Duplicate ID detection
- **ID Integrity Check** - Ensures nextId stays unique
- **Visual Warnings** - Clear error/warning indicators

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| State | Zustand with persistence |
| XML | fast-xml-parser |
| Icons | Lucide React |
| Deployment | Vercel |

## Form Structure

```
questionnaire
├── section
│   └── subsection
│       ├── question
│       ├── entity (single/addmore)
│       │   └── question
│       ├── conditionset (and/or/switch)
│       │   ├── question (trigger)
│       │   └── conditional
│       │       └── question
│       ├── includeform
│       ├── required-doc
│       └── description/warning/note
```

## Question Types

| Type | Description | Format Options |
|------|-------------|----------------|
| `char` | Single-line text | email, integer |
| `text` | Multi-line textarea | large |
| `radio` | Yes/No radio buttons | - |
| `select` | Dropdown selection | - |
| `date` | Date picker | mm/yy, mm/dd/yy, dob_*, present_* |
| `state` | US State dropdown | exclude_state, gov_state |
| `country` | Country dropdown | - |
| `county` | County dropdown | - |
| `zip` | ZIP code | - |
| `ssn` | Social Security Number | - |
| `signature` | Digital signature | - |
| `lawschool` | Law school selector | aba, all |
| `profilereference` | Auto-fill from profile | 50+ field options |

## Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/cankilic-gh/formforge.git
cd formforge

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Usage

1. **Create New Form** - Click "New" and enter a form title
2. **Import Existing** - Click "Open" to load an XML file
3. **Add Elements** - Select a node, use sidebar tools to add children
4. **Edit Properties** - Select any node to edit in right panel
5. **Preview** - Click "Preview" to see applicant view
6. **Export** - Click "Save" to download XML

## Project Structure

```
formforge/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── FormTree.tsx      # Tree view with drag-drop
│   │   ├── PropertyPanel.tsx # Node property editor
│   │   ├── Sidebar.tsx       # Tools palette
│   │   ├── Toolbar.tsx       # File & edit actions
│   │   ├── FormPreview.tsx   # Live form preview
│   │   ├── ValidationStatus.tsx # ID validation
│   │   └── SmartFormGenerator.tsx
│   ├── stores/
│   │   └── formStore.ts      # Zustand state management
│   ├── lib/
│   │   └── xmlParser.ts      # XML parse/build logic
│   └── types/
│       └── form.ts           # TypeScript interfaces
├── public/
├── tailwind.config.ts
└── package.json
```

## Part of TheGridBase

FormForge is part of the [TheGridBase](https://github.com/cankilic-gh/thegridbase) ecosystem - a multi-agent development platform for exceptional web applications.

### Related Projects

| Project | Description |
|---------|-------------|
| [RiffForge](https://github.com/cankilic-gh/riffforge) | Music creation platform |
| [MyLoanPlans](https://github.com/cankilic-gh/myloanplans) | Financial planning tools |
| [FutureLex](https://github.com/cankilic-gh/futurelex) | Language learning app |

---

<div align="center">

**Built with purpose by [Can Kilic](https://cankilic.com)**

*Part of TheGridBase Ecosystem*

</div>

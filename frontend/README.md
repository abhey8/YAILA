# AI Learning Assistant - Frontend UI

A modern, clean, and highly engaging web-based AI Learning Assistant application built with React, Tailwind CSS, and Motion animations.

## 🎯 Overview

This is a **frontend-only** UI implementation that demonstrates a complete learning assistant interface. The design combines the best of Notion, Duolingo, and ChatGPT to create a motivating, student-friendly experience.

## ✨ Features

### 🔐 Authentication
- Login page with email/password
- Registration page with form validation
- Clean, modern auth UI with gradient backgrounds

### 📊 Dashboard
- Progress statistics cards (documents, flashcards, quizzes, accuracy)
- Recent activity timeline
- Quick action buttons
- Motivating progress visibility

### 📄 Document Management
- Document listing with grid/list view toggle
- Search functionality
- Upload modal with drag-and-drop support
- Document cards with metadata (size, pages, upload date)
- Delete functionality

### 📖 Document Detail Page (Tabbed Interface)
1. **AI Chat**: Interactive chat interface with message bubbles
2. **Summary & Explain**: AI-powered document summarization and concept explanation
3. **Flashcards**: Auto-generated flashcards with flip animations
4. **Quiz**: Quiz generation with configurable settings

### 🎴 Flashcard System
- Beautiful flip animations
- Favorite/unfavorite functionality
- Delete individual flashcards
- Flashcard review page with navigation
- Shuffle feature for spaced repetition
- Progress tracking

### 📝 Quiz System
- Multiple-choice questions
- Timer countdown
- Question navigation grid
- Progress bar
- Answer selection with visual feedback
- Results page with detailed review
- Score visualization with motivational messages
- Retry functionality

### 👤 Profile Page
- Edit profile information
- Change password
- User statistics
- Preferences (notifications, reminders, dark mode toggles)
- Avatar display

### 🎨 UI Components
- **Sidebar Navigation**: Collapsible sidebar with smooth animations
- **Top Bar**: Search functionality and notifications
- **Floating Upload Button**: Always accessible upload trigger
- **Toast Notifications**: Real-time feedback using Sonner
- **Skeleton Loaders**: Loading states for better UX
- **Empty States**: Helpful guidance when no data exists
- **Progress Cards**: Visual statistics display
- **Chat Messages**: User and AI message bubbles
- **Quiz Question Cards**: Interactive question interface

## 🎨 Design Features

- **Soft Academic Color Palette**: Indigo, purple, green, orange accents
- **Glassmorphism Effects**: Subtle shadows and modern aesthetics
- **Smooth Animations**: Motion/React for fluid transitions
- **Micro-interactions**: Hover effects, button feedback
- **Responsive Design**: Works on laptop and mobile screens
- **Clean Typography**: Readable fonts and spacing
- **Rounded Cards**: Modern card-based layout

## 🛠️ Technology Stack

- **React 18.3.1**: Modern React with hooks
- **React Router 7**: Client-side routing with data mode
- **Tailwind CSS 4**: Utility-first styling
- **Motion (Framer Motion)**: Smooth animations
- **Lucide React**: Beautiful icon library
- **Sonner**: Toast notifications
- **TypeScript**: Type-safe development

## 📁 Project Structure

```
src/
├── app/
│   ├── components/
│   │   ├── ChatMessage.tsx
│   │   ├── DocumentCard.tsx
│   │   ├── EmptyState.tsx
│   │   ├── FlashcardComponent.tsx
│   │   ├── ProgressStatCard.tsx
│   │   ├── QuizQuestionCard.tsx
│   │   ├── Sidebar.tsx
│   │   ├── SkeletonLoader.tsx
│   │   ├── TopBar.tsx
│   │   ├── UploadButton.tsx
│   │   └── UploadModal.tsx
│   ├── layouts/
│   │   ├── AuthLayout.tsx
│   │   └── Layout.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── DocumentDetail.tsx
│   │   ├── Documents.tsx
│   │   ├── FlashcardReview.tsx
│   │   ├── Login.tsx
│   │   ├── Profile.tsx
│   │   ├── QuizAttempt.tsx
│   │   ├── QuizResult.tsx
│   │   └── Register.tsx
│   ├── App.tsx
│   └── routes.tsx
└── styles/
    ├── fonts.css
    ├── index.css
    ├── tailwind.css
    └── theme.css
```

## 🚀 Key Features by Page

### Login & Register
- Clean auth forms with icon-enhanced inputs
- Password visibility toggle
- Remember me checkbox
- Links between auth pages

### Dashboard
- 4 stat cards with trends
- Recent activity feed with icons
- Quick action buttons
- Welcoming header

### Documents
- Grid/List view toggle
- Search with real-time filtering
- Upload via modal
- Document cards with actions

### Document Detail
- 4-tab interface (Chat, Summary, Flashcards, Quiz)
- AI chat with message history
- Summary generation
- Flashcard management
- Quiz configuration

### Quiz Attempt
- Timer with visual countdown
- Progress bar
- Question navigation
- Answer selection
- Submit quiz

### Quiz Result
- Score visualization
- Detailed answer review
- Correct/incorrect indicators
- Retry option

### Flashcard Review
- Card-by-card review
- Flip animations
- Navigation arrows
- Shuffle functionality
- Progress tracking

### Profile
- Editable user information
- Password change form
- Statistics display
- Preference toggles

## 🎯 Mock Data

The application uses realistic mock data to demonstrate functionality:
- Sample documents with metadata
- Pre-generated flashcards
- Example quiz questions
- Activity timeline
- User statistics

## 💡 Next Steps (Backend Integration)

To make this a full-stack application, you would need to:

1. **Set up a backend** (Node.js/Express or use Supabase)
2. **Add authentication** (JWT tokens, session management)
3. **Create database schemas** (Users, Documents, Flashcards, Quizzes, ChatHistory)
4. **Integrate Google Gemini API** for AI features
5. **Implement file upload** to cloud storage
6. **Add real-time data** fetching and mutations
7. **Connect all UI interactions** to actual API endpoints

## 🎨 Color Scheme

- Primary: Indigo (#4F46E5)
- Secondary: Purple (#9333EA)
- Success: Green (#10B981)
- Warning: Orange (#F59E0B)
- Error: Red (#EF4444)
- Background: Gray (#F9FAFB)

## 📱 Responsive Design

The application is fully responsive with breakpoints for:
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

## ✨ Animations

- Page transitions
- Card hover effects
- Flashcard flip animations
- Loading states
- Toast notifications
- Smooth scrolling
- Progress bar animations

## 🔥 Best Practices

- Clean component architecture
- Reusable UI components
- Type-safe with TypeScript interfaces
- Semantic HTML
- Accessible forms and buttons
- Optimized performance
- Consistent design system

---

Built with ❤️ using React, Tailwind CSS, and Motion

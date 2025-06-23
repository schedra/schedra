# Schedra Project Context for Claude Code

## Project Overview

**Schedra** is a smart events scheduler that combines traditional calendar functionality with intelligent automation. This document contains all the context, decisions, and specifications needed for development.

## Quick Reference

- **Service Description**: `service-description.md`
- **API Specification**: `api-specification.md`
- **Architecture Documentation**: `architecture.md`
- **Figma Design**: https://www.figma.com/design/yEfWRlJ04gEZmu6bipmvUV/Calendar-Automation?node-id=29-20
- **Project Type**: Smart calendar automation with auto-planning engine
- **Tech Stack**: FastAPI + PostgreSQL + Redis + Celery

## Development Phases

### Phase 1: Basic CRUD and Plan Visualization ✅
**Status**: Design complete, ready for implementation

**Core Features**:
- Task CRUD operations (create, read, update, delete)
- Task properties: title, description, duration, deadline, priority
- Calendar views: Day, Week, List
- Task completion tracking
- Search functionality

**Key Endpoints**:
```
POST /tasks - Create task
GET /tasks - List tasks
PUT /tasks/{id} - Update task
DELETE /tasks/{id} - Delete task
POST /tasks/{id}/complete - Mark complete
GET /calendar/view - Calendar views
GET /search - Search tasks
```

### Phase 2: Auto-Planning Engine 🚀
**Status**: Specifications complete

**Core Features**:
- Automatic task distribution across week
- Deadline-aware planning
- Dynamic rescheduling for missed tasks
- Optimal time suggestions

**Key Endpoints**:
```
POST /schedule/generate - Generate automatic schedule
POST /schedule/reschedule - Reschedule missed tasks
GET /schedule/suggestions/{taskId} - Get optimal times
```

### Phase 3: Recurring Tasks and Constraints 📅
**Key Features**:
- Recurring task patterns
- Time windows and constraints
- Working hours configuration
- Multiple calendar support

### Phase 4: External Calendar Integration 🔗
**Key Features**:
- Google Calendar sync
- Apple Calendar sync
- Unified calendar view

### Phase 5: Advanced Features ⚡
**Key Features**:
- Task dependencies
- Tag system
- Buffer time management
- Task splitting

### Phase 6: Polish and Release 🎯
**Key Features**:
- Testing and QA
- Documentation
- Performance optimization

## Figma Design Analysis

### Screen Breakdown (6 Main Screens)
1. **Basic Week View** - Standard calendar layout
2. **Enhanced Week View** - With navigation and menu
3. **Timeline Week View** - With horizontal dividers
4. **Week View + Task Panel** - Right sidebar for task creation
5. **Week View + Enhanced Tasks** - Extended task management
6. **Registration Screen** - Authentication interface

### UI Components Identified
- **Task Cards**: Duration-based (5min to 1+ hours), color-coded
- **Calendar Grid**: Time slots with availability states
- **Navigation**: Hamburger menu, search, view switching
- **Buttons**: Primary, Secondary, Icon variants with hover states
- **Input Fields**: Task creation with duration selection
- **Extended FAB**: Floating action button

### Color Scheme
- **Future Tasks**: Blue (#3B82F6)
- **Past Tasks**: Light blue (#C3DAFF)
- **Background**: White (#FFFFFF)
- **Text**: Dark (#0A0A0A)

## API Specification Summary

### Authentication
```
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

### Core Task Management
```
POST /tasks
GET /tasks
GET /tasks/{id}
PUT /tasks/{id}
DELETE /tasks/{id}
POST /tasks/{id}/complete
```

### Calendar & Views
```
GET /calendar/view?view_type=day|week|month|list
GET /calendar/unified - Combined internal + external
```

### Auto-Planning
```
POST /schedule/generate
GET /schedule
PUT /schedule
POST /schedule/reschedule
GET /schedule/suggestions/{taskId}
```

### User Settings
```
GET /user/preferences
PUT /user/preferences
PUT /user/working-hours
```

### Analytics
```
GET /analytics/productivity
GET /tasks/conflicts
POST /schedule/validate
```

### Real-time
```
WSS /ws/schedule - WebSocket for live updates
```

## Data Models

### Task Model
```json
{
  "id": "string",
  "title": "string", 
  "description": "string",
  "duration": 30,
  "deadline": "2024-01-15T14:30:00Z",
  "priority": "high|medium|low",
  "status": "pending|scheduled|in_progress|completed|cancelled",
  "earliest_start_time": "2024-01-15T09:00:00Z",
  "energy_level": "high|medium|low",
  "actual_duration": 35,
  "completed_at": "2024-01-15T14:30:00Z",
  "tags": ["work", "important"],
  "calendar_id": "string",
  "scheduled_time": {
    "start": "2024-01-15T10:00:00Z",
    "end": "2024-01-15T11:00:00Z"
  }
}
```

### Calendar Model
```json
{
  "id": "string",
  "name": "string",
  "color": "#3B82F6",
  "is_default": false,
  "is_external": false,
  "external_source": "google|apple"
}
```

## Russian Roadmap Translation

**Original Requirements**:
- Базовый CRUD и представление плана (Basic CRUD and plan visualization)
- Движок автопланирования (Auto-planning engine)
- Регулярные задачи и ограничения (Recurring tasks and constraints)
- Интеграции с внешними календарями (External calendar integrations)
- Дополнительные удобства и гибкость (Additional conveniences and flexibility)
- Полировка и готовность к выпуску (Polish and release readiness)

## Key Architectural Decisions

### API Design Principles
- RESTful architecture with standard HTTP methods
- JWT-based authentication
- Comprehensive error handling with standard HTTP status codes
- Rate limiting for API protection
- WebSocket support for real-time updates

### Task Duration System
- Support for granular durations: 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55 minutes, 1+ hours
- Visual representation through task card heights
- Duration-based scheduling optimization

### Auto-Planning Algorithm Requirements
- Consider task deadlines and priorities
- Respect user working hours and constraints
- Handle task dependencies
- Support for task splitting when large blocks unavailable
- Automatic rescheduling of missed tasks

## Development Guidelines

### Code Standards
- Follow existing patterns in codebase
- Use established libraries and frameworks
- Implement comprehensive error handling
- Include proper logging and monitoring

### Testing Strategy
- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows
- Performance testing for scheduling algorithms

### Security Considerations
- JWT token validation on all endpoints
- Rate limiting to prevent abuse
- Input validation and sanitization
- Secure external calendar integration

## File Structure Context

```
schedra/
├── service-description.md     # Comprehensive service overview
├── api-specification.md       # Complete API documentation
├── architecture.md           # FastAPI + PostgreSQL architecture
├── CLAUDE.md                 # This context file
├── app/                      # FastAPI application (see architecture.md)
│   ├── main.py              # FastAPI app entry point
│   ├── core/                # Config, database, security
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response models
│   ├── api/                 # Route handlers
│   ├── services/            # Business logic layer
│   ├── repositories/        # Data access layer
│   ├── workers/             # Celery background tasks
│   └── utils/               # Utilities and helpers
├── tests/                   # Comprehensive test suite
├── alembic/                 # Database migrations
├── docker-compose.yml       # Development environment
└── requirements.txt         # Python dependencies
```

## Next Steps for Development

### Immediate Priorities (Phase 1)
1. **Backend Setup**: FastAPI project structure and configuration
2. **Database Setup**: PostgreSQL schema implementation from architecture.md
3. **Authentication**: JWT-based auth system with bcrypt password hashing
4. **Basic CRUD**: Task management endpoints with full validation
5. **Calendar Views**: Calendar view generation with time slot optimization
6. **Frontend Setup**: Choose framework (React, Vue, etc.) and implement basic UI

### Phase 1 Implementation Order
1. User authentication and registration
2. Basic task CRUD operations
3. Calendar view generation
4. Task completion and search
5. Frontend integration with API
6. Basic UI components from Figma

## External Integrations

### Google Calendar
- OAuth2 flow for authentication
- Events API for bi-directional sync
- Webhook support for real-time updates

### Apple Calendar
- CalDAV protocol for calendar access
- iCloud integration considerations

## Performance Considerations

### Auto-Planning Algorithm
- Optimize for sub-second response times
- Cache frequently accessed schedules
- Background processing for complex rescheduling

### Real-time Updates
- WebSocket connection management
- Efficient diff algorithms for schedule changes
- Client-side caching strategies

## Monitoring and Analytics

### User Analytics
- Task completion rates
- Feature usage patterns
- Performance metrics

### System Monitoring
- API response times
- Error rates and types
- Resource utilization

---

## Architecture Summary

### Technology Stack Confirmed
- **Backend**: FastAPI (async Python web framework)
- **Database**: PostgreSQL 15+ with SQLAlchemy 2.0 (async ORM)
- **Caching**: Redis 7+ (sessions, caching, real-time features)
- **Background Tasks**: Celery + Redis
- **Authentication**: JWT with bcrypt password hashing
- **Real-time**: FastAPI native WebSocket support

### Key Architecture Features
- **15+ Database Tables**: Complete schema in architecture.md
- **Layered Architecture**: API → Service → Repository → Database
- **Auto-Planning Engine**: Constraint satisfaction algorithm
- **Real-time Updates**: WebSocket connection management
- **File Storage**: Task attachments and user media
- **External Integrations**: Google Calendar, Apple Calendar
- **Background Processing**: Async task scheduling and sync
- **Comprehensive Security**: Rate limiting, JWT, input validation
- **Testing Strategy**: Unit, integration, e2e, performance tests
- **Production Ready**: Docker, health checks, monitoring

---

**Last Updated**: Architecture complete with FastAPI + PostgreSQL implementation
**Status**: Ready for Phase 1 implementation - see architecture.md for complete technical specs
**Next Review**: After Phase 1 completion
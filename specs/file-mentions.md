# File Mention Specification

## Overview
File mention support allows users to reference files using `@filename` syntax with fuzzy search and auto-completion.

## User Interface

### Syntax
- Type `@` followed by filename
- Fuzzy search activates automatically
- Tab/Shift+Tab to navigate results
- Enter to insert file reference

### Search Features
- Fuzzy matching on filename
- Working directory awareness
- Relative path resolution
- Real-time search as you type

## Implementation

### CommandInput Component
```typescript
interface FileSearchState {
  isSearching: boolean;
  searchTerm: string;
  matches: string[];
  selectedIndex: number;
}
```

### File Discovery
- Recursive directory traversal
- Respects working directory setting
- Filters by file patterns
- Sorts by relevance

### Integration Points
- Works in both prompt input and full-screen view
- Preserves existing input text
- Inserts at cursor position

## Technical Details

### Search Algorithm
1. Extract search term after `@`
2. Find files matching fuzzy pattern
3. Rank by relevance and recency
4. Display in dropdown interface

### File Path Resolution
- Relative to instance working directory
- Absolute paths when needed
- Proper escaping for shell commands

### Performance
- Cached file listings
- Incremental search updates
- Debounced search queries

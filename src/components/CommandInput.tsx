import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { promises as fs } from 'fs';
import { join, relative } from 'path';

interface CommandInputProps {
  instanceName: string;
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
  workingDirectory?: string;
}

interface FileMatch {
  path: string;
  relativePath: string;
}

export const CommandInput: React.FC<CommandInputProps> = ({ 
  instanceName, 
  onSubmit, 
  onCancel,
  workingDirectory = process.cwd()
}) => {
  const [input, setInput] = useState('');
  const [fileSearchMode, setFileSearchMode] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [fileMatches, setFileMatches] = useState<FileMatch[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [searchStartPos, setSearchStartPos] = useState(0);

  // File search functionality
  const searchFiles = async (query: string): Promise<FileMatch[]> => {
    if (!query || query.length < 2) return [];
    
    try {
      const findFiles = async (dir: string, maxDepth: number = 3): Promise<string[]> => {
        if (maxDepth <= 0) return [];
        
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files: string[] = [];
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          
          if (entry.isFile()) {
            // Filter by query
            if (entry.name.toLowerCase().includes(query.toLowerCase())) {
              files.push(fullPath);
            }
          } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const subFiles = await findFiles(fullPath, maxDepth - 1);
            files.push(...subFiles);
          }
        }
        
        return files;
      };
      
      const foundFiles = await findFiles(workingDirectory);
      
      return foundFiles
        .slice(0, 10) // Limit to 10 matches
        .map(path => ({
          path,
          relativePath: relative(workingDirectory, path)
        }));
    } catch (error) {
      return [];
    }
  };

  // Update file matches when search query changes
  useEffect(() => {
    if (fileSearchMode && fileSearchQuery) {
      searchFiles(fileSearchQuery).then(matches => {
        setFileMatches(matches);
        setSelectedFileIndex(0);
      });
    } else {
      setFileMatches([]);
    }
  }, [fileSearchQuery, fileSearchMode, workingDirectory]);

  // Handler for canceling that clears terminal
  const handleCancel = () => {
    // Clear terminal before canceling to prevent UI artifacts
    process.stdout.write('\x1B[2J\x1B[0f');
    onCancel();
  };

  // Handler for submitting that clears terminal
  const handleSubmit = (text: string) => {
    // Clear terminal before submitting to prevent UI artifacts
    process.stdout.write('\x1B[2J\x1B[0f');
    onSubmit(text);
  };

  const insertFileReference = (filePath: string) => {
    const beforeCursor = input.substring(0, searchStartPos);
    const afterCursor = input.substring(searchStartPos + fileSearchQuery.length + 1); // +1 for @
    const newInput = `${beforeCursor}@${filePath}${afterCursor}`;
    
    setInput(newInput);
    setFileSearchMode(false);
    setFileSearchQuery('');
    setFileMatches([]);
  };

  useInput((inputChar, key) => {
    if (key.escape) {
      if (fileSearchMode) {
        setFileSearchMode(false);
        setFileSearchQuery('');
        setFileMatches([]);
      } else {
        handleCancel();
      }
    } else if (key.return) {
      if (fileSearchMode && fileMatches.length > 0) {
        // Insert selected file
        insertFileReference(fileMatches[selectedFileIndex].relativePath);
      } else if (input.trim()) {
        handleSubmit(input.trim());
        setInput('');
      }
    } else if (key.tab && fileSearchMode) {
      // Navigate file matches
      if (key.shift) {
        setSelectedFileIndex(prev => prev > 0 ? prev - 1 : fileMatches.length - 1);
      } else {
        setSelectedFileIndex(prev => prev < fileMatches.length - 1 ? prev + 1 : 0);
      }
    } else if (key.backspace || key.delete) {
      if (fileSearchMode) {
        if (fileSearchQuery.length === 0) {
          setFileSearchMode(false);
          setInput(prev => prev.slice(0, -1)); // Remove the @
        } else {
          setFileSearchQuery(prev => prev.slice(0, -1));
        }
      } else {
        setInput(prev => prev.slice(0, -1));
      }
    } else if (inputChar && !key.ctrl && !key.meta) {
      if (inputChar === '@' && !fileSearchMode) {
        // Start file search mode
        setFileSearchMode(true);
        setSearchStartPos(input.length);
        setFileSearchQuery('');
        setInput(prev => prev + inputChar);
      } else if (fileSearchMode) {
        setFileSearchQuery(prev => prev + inputChar);
      } else {
        setInput(prev => prev + inputChar);
      }
    }
  });

  return (
    <Box
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      height={fileSearchMode && fileMatches.length > 0 ? 15 : 10}
    >
      <Box
        borderStyle="double"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        width={80}
        flexDirection="column"
      >
        <Text color="cyan" bold>
          Send Prompt to: {instanceName}
        </Text>
        
        <Box marginTop={1} marginBottom={1}>
          <Text color="yellow">Prompt: </Text>
          <Text color="white">{input}</Text>
          <Text color="cyan">█</Text>
        </Box>

        {fileSearchMode && (
          <Box marginBottom={1} flexDirection="column">
            <Text color="magenta">
              File search: @{fileSearchQuery}
            </Text>
            {fileMatches.length > 0 && (
              <Box flexDirection="column" paddingLeft={2}>
                {fileMatches.slice(0, 5).map((file, index) => (
                  <Text 
                    key={file.path} 
                    color={index === selectedFileIndex ? "cyan" : "gray"}
                    bold={index === selectedFileIndex}
                  >
                    {index === selectedFileIndex ? "► " : "  "}{file.relativePath}
                  </Text>
                ))}
                {fileMatches.length > 5 && (
                  <Text color="gray" dimColor>
                    ... and {fileMatches.length - 5} more files
                  </Text>
                )}
              </Box>
            )}
          </Box>
        )}

        <Box flexDirection="column">
          <Text color="gray" dimColor>
            • Type your prompt and press Enter to send
          </Text>
          <Text color="gray" dimColor>
            • Use @ to mention files (Tab/Shift+Tab to navigate)
          </Text>
          <Text color="gray" dimColor>
            • Press Escape to cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}; 
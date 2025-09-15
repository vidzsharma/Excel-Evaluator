import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, Shield, CheckCircle2, Play, FileSpreadsheet } from "lucide-react";

interface TaskResult {
  taskId: number;
  task: string;
  completed: boolean;
  score: number;
  justification: string;
  actions: SpreadsheetAction[];
  timeSpent: number;
}

interface SpreadsheetAction {
  timestamp: string;
  type: 'cell_edit' | 'formula_entered' | 'data_changed';
  cell: string;
  oldValue: string;
  newValue: string;
}

interface CheatingFlag {
  type: 'paste' | 'tab_switch';
  timestamp: string;
}

const EXCEL_TASKS = [
  {
    id: 1,
    title: "Basic VLOOKUP",
    description: "In cell F2, create a VLOOKUP formula to find the price of the product ID entered in cell E2.",
    expectedResult: "=VLOOKUP(E2,A:B,2,FALSE)",
    difficulty: "Easy",
    timeLimit: 180 // 3 minutes
  },
  {
    id: 2, 
    title: "Data Validation & Formatting",
    description: "Apply currency formatting to column B (Price) and create a data validation dropdown in E2 with the product IDs from column A.",
    expectedResult: "formatted_currency",
    difficulty: "Medium",
    timeLimit: 300 // 5 minutes
  },
  {
    id: 3,
    title: "INDEX MATCH Alternative",
    description: "In cell F3, create an INDEX/MATCH formula that does the same lookup as the VLOOKUP in F2, but can search in any direction.",
    expectedResult: "=INDEX(B:B,MATCH(E2,A:A,0))",
    difficulty: "Medium", 
    timeLimit: 240 // 4 minutes
  },
  {
    id: 4,
    title: "Error Handling",
    description: "Modify your VLOOKUP formula in F2 to display 'Product Not Found' instead of #N/A when the lookup fails.",
    expectedResult: "=IFERROR(VLOOKUP(E2,A:B,2,FALSE),\"Product Not Found\")",
    difficulty: "Hard",
    timeLimit: 300 // 5 minutes
  },
  {
    id: 5,
    title: "Advanced Analysis",
    description: "Create a summary in cells H1:I3 showing: Total Products, Average Price, and Most Expensive Product Name.",
    expectedResult: "multiple_formulas",
    difficulty: "Hard",
    timeLimit: 420 // 7 minutes
  }
];

const SAMPLE_DATA = [
  ['Product ID', 'Product Name', 'Price', 'Category'],
  ['P001', 'Laptop Pro', '1299.99', 'Electronics'],
  ['P002', 'Wireless Mouse', '29.99', 'Electronics'], 
  ['P003', 'Office Chair', '249.50', 'Furniture'],
  ['P004', 'Desk Lamp', '89.99', 'Furniture'],
  ['P005', 'Notebook Set', '15.99', 'Stationery'],
  ['P006', 'Pen Collection', '24.99', 'Stationery'],
  ['P007', 'Monitor 4K', '599.99', 'Electronics'],
  ['P008', 'Keyboard Pro', '149.99', 'Electronics']
];

const InteractiveExcelAssessment: React.FC = () => {
  const [assessmentStage, setAssessmentStage] = useState<'welcome' | 'tasks' | 'report'>('welcome');
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [taskResults, setTaskResults] = useState<TaskResult[]>([]);
  const [spreadsheetActions, setSpreadsheetActions] = useState<SpreadsheetAction[]>([]);
  const [cheatingFlags, setCheatingFlags] = useState<CheatingFlag[]>([]);
  const [taskStartTime, setTaskStartTime] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [spreadsheetData, setSpreadsheetData] = useState(SAMPLE_DATA);
  const [selectedCell, setSelectedCell] = useState('A1');
  const [cellFormula, setCellFormula] = useState('');
  const spreadsheetRef = useRef<HTMLDivElement>(null);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (assessmentStage === 'tasks' && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleTaskComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [assessmentStage, timeRemaining]);

  // Anti-cheating detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && assessmentStage === 'tasks') {
        setCheatingFlags(prev => [...prev, {
          type: 'tab_switch',
          timestamp: new Date().toISOString()
        }]);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [assessmentStage]);

  const handleCellClick = (rowIndex: number, colIndex: number) => {
    const cellName = String.fromCharCode(65 + colIndex) + (rowIndex + 1);
    setSelectedCell(cellName);
    const cellValue = spreadsheetData[rowIndex]?.[colIndex] || '';
    setCellFormula(typeof cellValue === 'string' && cellValue.startsWith('=') ? cellValue : '');
  };

  const handleCellEdit = (rowIndex: number, colIndex: number, newValue: string) => {
    const cellName = String.fromCharCode(65 + colIndex) + (rowIndex + 1);
    const oldValue = spreadsheetData[rowIndex]?.[colIndex] || '';
    
    // Track the action
    const action: SpreadsheetAction = {
      timestamp: new Date().toISOString(),
      type: newValue.startsWith('=') ? 'formula_entered' : 'cell_edit',
      cell: cellName,
      oldValue: oldValue.toString(),
      newValue: newValue
    };
    
    setSpreadsheetActions(prev => [...prev, action]);
    
    // Update spreadsheet data
    const newData = [...spreadsheetData];
    if (!newData[rowIndex]) newData[rowIndex] = [];
    newData[rowIndex][colIndex] = newValue;
    setSpreadsheetData(newData);
  };

  const evaluateTask = async (taskId: number, actions: SpreadsheetAction[]): Promise<{ score: number; justification: string }> => {
    if (!apiKey) {
      return { score: 0, justification: "API key required for evaluation" };
    }

    try {
      const task = EXCEL_TASKS.find(t => t.id === taskId);
      if (!task) return { score: 0, justification: "Task not found" };

      const systemPrompt = `You are an expert Excel evaluator. Analyze the candidate's spreadsheet actions and determine if they completed the task correctly.

Task: ${task.description}
Expected Result: ${task.expectedResult}

Evaluate based on:
1. **Correctness**: Did they achieve the expected result?
2. **Formula Quality**: Are the formulas efficient and proper?
3. **Task Completion**: Was the task fully completed?

Respond ONLY with JSON:
{
  "score": <0-10 integer>,
  "justification": "<brief explanation>"
}`;

      const userPrompt = `Spreadsheet Actions Taken:
${actions.map(a => `${a.timestamp}: ${a.type} in cell ${a.cell} - changed "${a.oldValue}" to "${a.newValue}"`).join('\n')}

Current Spreadsheet State:
${spreadsheetData.map((row, i) => `Row ${i + 1}: ${row.join(' | ')}`).join('\n')}

Evaluate the task completion.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }],
          generationConfig: { temperature: 0.2, topK: 1, topP: 1, maxOutputTokens: 200 }
        }),
      });

      if (!response.ok) throw new Error('Failed to evaluate task');

      const data = await response.json();
      const aiResponse = data.candidates[0].content.parts[0].text;
      
      try {
        const parsed = JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
        return {
          score: parsed.score || 0,
          justification: parsed.justification || "Unable to evaluate task"
        };
      } catch {
        return { score: 5, justification: "Task received but could not be properly evaluated" };
      }
    } catch (error) {
      console.error('Error evaluating task:', error);
      return { score: 0, justification: "Error occurred during evaluation" };
    }
  };

  const handleTaskComplete = async () => {
    if (!taskStartTime) return;

    setIsLoading(true);
    const currentTask = EXCEL_TASKS[currentTaskIndex];
    const taskActions = spreadsheetActions.filter(action => 
      new Date(action.timestamp) >= taskStartTime
    );
    
    const timeSpent = Math.round((new Date().getTime() - taskStartTime.getTime()) / 1000);
    const evaluation = await evaluateTask(currentTask.id, taskActions);

    const result: TaskResult = {
      taskId: currentTask.id,
      task: currentTask.description,
      completed: evaluation.score >= 6,
      score: evaluation.score,
      justification: evaluation.justification,
      actions: taskActions,
      timeSpent
    };

    setTaskResults(prev => [...prev, result]);

    if (currentTaskIndex < EXCEL_TASKS.length - 1) {
      setCurrentTaskIndex(prev => prev + 1);
      startNextTask();
    } else {
      setAssessmentStage('report');
    }
    setIsLoading(false);
  };

  const startNextTask = () => {
    const nextTask = EXCEL_TASKS[currentTaskIndex + 1];
    if (nextTask) {
      setTaskStartTime(new Date());
      setTimeRemaining(nextTask.timeLimit);
    }
  };

  const startAssessment = () => {
    if (!apiKey) {
      setShowApiKeyInput(true);
      return;
    }
    setAssessmentStage('tasks');
    setTaskStartTime(new Date());
    setTimeRemaining(EXCEL_TASKS[0].timeLimit);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Welcome Screen
  if (assessmentStage === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-3xl shadow-elegant">
          <CardHeader className="text-center pb-8">
            <div className="mx-auto mb-4 w-16 h-16 bg-gradient-primary rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Interactive Excel Skills Assessment
            </CardTitle>
            <CardDescription className="text-lg mt-4">
              Work with real spreadsheet data and formulas - just like in Microsoft Excel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted rounded-lg p-6">
              <h3 className="font-semibold text-lg mb-3">How It Works</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Interactive spreadsheet with real data manipulation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  5 hands-on tasks: VLOOKUP, formulas, data analysis
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Time-limited tasks with live action tracking
                </li>
                <li className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  AI evaluates your actual spreadsheet work
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-primary/5 rounded-lg p-4 border border-primary/20">
                <h4 className="font-semibold text-primary mb-2">Sample Tasks Include:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Create VLOOKUP formulas</li>
                  <li>• Use INDEX/MATCH functions</li>
                  <li>• Handle formula errors</li>
                  <li>• Apply data formatting</li>
                  <li>• Build summary analysis</li>
                </ul>
              </div>
              <div className="bg-warning/5 rounded-lg p-4 border border-warning/20">
                <h4 className="font-semibold text-warning mb-2">Assessment Rules:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Timed tasks (3-7 minutes each)</li>
                  <li>• All actions are recorded</li>
                  <li>• No external help allowed</li>
                  <li>• Tab switching monitored</li>
                </ul>
              </div>
            </div>
            
            {showApiKeyInput && (
              <div className="space-y-4 border border-warning rounded-lg p-4 bg-warning/5">
                <div className="flex items-center gap-2 text-warning">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">API Key Required</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Please enter your Google Gemini API key to enable AI evaluation of your spreadsheet work.
                </p>
                <textarea
                  placeholder="Enter your Gemini API key..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full p-3 border rounded-md resize-none bg-background"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Get your API key at: https://makersuite.google.com/app/apikey
                </p>
              </div>
            )}
            
            <Button 
              onClick={startAssessment}
              className="w-full py-6 text-lg font-semibold shadow-button hover:shadow-elegant transition-all duration-300"
              disabled={showApiKeyInput && !apiKey}
            >
              <Play className="w-5 h-5 mr-2" />
              {showApiKeyInput && !apiKey ? 'Enter API Key to Continue' : 'Start Interactive Assessment'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tasks Screen
  if (assessmentStage === 'tasks') {
    const currentTask = EXCEL_TASKS[currentTaskIndex];
    const progress = ((currentTaskIndex + 1) / EXCEL_TASKS.length) * 100;
    
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold">Interactive Excel Assessment</h1>
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Time: {formatTime(timeRemaining)}
                </Badge>
                <Badge variant="outline">
                  Task {currentTaskIndex + 1} of {EXCEL_TASKS.length}
                </Badge>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            {/* Task Instructions - Left Panel */}
            <div className="xl:col-span-1">
              <Card className="shadow-card sticky top-4">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{currentTask.title}</CardTitle>
                    <Badge variant={currentTask.difficulty === 'Easy' ? 'default' : currentTask.difficulty === 'Medium' ? 'secondary' : 'destructive'}>
                      {currentTask.difficulty}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">Task:</h4>
                    <p className="text-sm leading-relaxed">{currentTask.description}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Progress:</h4>
                    {taskResults.map((result, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-xs">Task {index + 1}</span>
                        <Badge variant={result.score >= 8 ? 'default' : result.score >= 6 ? 'secondary' : 'destructive'} className="text-xs">
                          {result.score}/10
                        </Badge>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-2 bg-primary/10 rounded border-2 border-primary/20">
                      <span className="text-xs font-medium">Current</span>
                      <Badge variant="outline" className="text-xs">Active</Badge>
                    </div>
                  </div>

                  <Button 
                    onClick={handleTaskComplete}
                    disabled={isLoading}
                    className="w-full mt-4"
                  >
                    {isLoading ? 'Evaluating...' : 'Complete Task'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Spreadsheet Interface - Main Panel */}
            <div className="xl:col-span-3">
              <Card className="shadow-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Excel Spreadsheet</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Selected: {selectedCell}</span>
                      <input
                        type="text"
                        placeholder="Enter formula..."
                        value={cellFormula}
                        onChange={(e) => setCellFormula(e.target.value)}
                        className="px-3 py-1 border rounded text-sm w-64"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const [col, row] = [selectedCell.charCodeAt(0) - 65, parseInt(selectedCell.slice(1)) - 1];
                            handleCellEdit(row, col, cellFormula);
                            setCellFormula('');
                          }
                        }}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden bg-white">
                    {/* Column Headers */}
                    <div className="flex border-b bg-muted/50">
                      <div className="w-12 h-8 border-r bg-muted flex items-center justify-center text-xs font-medium"></div>
                      {Array.from({ length: 8 }, (_, i) => (
                        <div key={i} className="flex-1 h-8 border-r bg-muted flex items-center justify-center text-xs font-medium min-w-[120px]">
                          {String.fromCharCode(65 + i)}
                        </div>
                      ))}
                    </div>
                    
                    {/* Spreadsheet Rows */}
                    {Array.from({ length: 15 }, (_, rowIndex) => (
                      <div key={rowIndex} className="flex border-b hover:bg-muted/30">
                        <div className="w-12 h-10 border-r bg-muted/50 flex items-center justify-center text-xs font-medium">
                          {rowIndex + 1}
                        </div>
                        {Array.from({ length: 8 }, (_, colIndex) => {
                          const cellName = String.fromCharCode(65 + colIndex) + (rowIndex + 1);
                          const cellValue = spreadsheetData[rowIndex]?.[colIndex] || '';
                          const isSelected = selectedCell === cellName;
                          
                          return (
                            <div
                              key={colIndex}
                              className={`flex-1 h-10 border-r p-1 cursor-pointer min-w-[120px] ${
                                isSelected ? 'bg-primary/20 border-primary' : 'hover:bg-muted/50'
                              }`}
                              onClick={() => handleCellClick(rowIndex, colIndex)}
                            >
                              <input
                                type="text"
                                value={cellValue}
                                onChange={(e) => handleCellEdit(rowIndex, colIndex, e.target.value)}
                                className="w-full h-full bg-transparent text-xs outline-none"
                                onPaste={() => setCheatingFlags(prev => [...prev, { type: 'paste', timestamp: new Date().toISOString() }])}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Report Screen
  const overallScore = taskResults.length > 0 ? Math.round(taskResults.reduce((sum, result) => sum + result.score, 0) / taskResults.length) : 0;
  const totalTime = taskResults.reduce((sum, result) => sum + result.timeSpent, 0);

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="max-w-4xl mx-auto">
        <Card className="shadow-elegant mb-8">
          <CardHeader className="text-center pb-8">
            <div className="mx-auto mb-4 w-20 h-20 bg-gradient-primary rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl font-bold">Assessment Complete</CardTitle>
            <CardDescription className="text-xl mt-2">
              Your Interactive Excel Skills Report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="text-center p-6 bg-muted rounded-xl">
                <div className={`text-3xl font-bold ${overallScore >= 8 ? 'text-success' : overallScore >= 6 ? 'text-warning' : 'text-destructive'}`}>
                  {overallScore}/10
                </div>
                <div className="text-sm text-muted-foreground mt-1">Overall Score</div>
              </div>
              <div className="text-center p-6 bg-muted rounded-xl">
                <div className="text-3xl font-bold text-foreground">{Math.round(totalTime / 60)}m</div>
                <div className="text-sm text-muted-foreground mt-1">Total Time</div>
              </div>
              <div className="text-center p-6 bg-muted rounded-xl">
                <div className={`text-3xl font-bold ${cheatingFlags.length > 0 ? 'text-warning' : 'text-success'}`}>
                  {cheatingFlags.length}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Integrity Flags</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Task Results */}
        <div className="space-y-6">
          {taskResults.map((result, index) => (
            <Card key={index} className="shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Task {index + 1}: {EXCEL_TASKS[result.taskId - 1]?.title}</CardTitle>
                  <Badge variant={result.score >= 8 ? 'default' : result.score >= 6 ? 'secondary' : 'destructive'}>
                    {result.score}/10
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Task Description:</h4>
                  <p className="text-muted-foreground bg-muted p-3 rounded-lg">{result.task}</p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Your Actions ({result.actions.length} total):</h4>
                  <div className="bg-muted p-3 rounded-lg max-h-32 overflow-y-auto">
                    {result.actions.map((action, i) => (
                      <div key={i} className="text-sm text-muted-foreground mb-1">
                        {action.cell}: {action.type === 'formula_entered' ? 'Formula' : 'Edit'} - "{action.newValue}"
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">AI Evaluation:</h4>
                  <p className="text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/10">
                    {result.justification}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Time: {Math.round(result.timeSpent / 60)}m {result.timeSpent % 60}s</span>
                  <span>Status: {result.completed ? '✅ Completed' : '❌ Incomplete'}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Academic Integrity */}
        {cheatingFlags.length > 0 && (
          <Card className="shadow-card border-warning mt-8">
            <CardHeader>
              <CardTitle className="text-lg text-warning flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Academic Integrity Report
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {cheatingFlags.filter(f => f.type === 'paste').length > 0 && (
                  <div className="flex items-center justify-between p-3 bg-warning/10 rounded-lg">
                    <span>Text pasted into spreadsheet</span>
                    <Badge variant="outline" className="text-warning">
                      {cheatingFlags.filter(f => f.type === 'paste').length} time(s)
                    </Badge>
                  </div>
                )}
                {cheatingFlags.filter(f => f.type === 'tab_switch').length > 0 && (
                  <div className="flex items-center justify-between p-3 bg-warning/10 rounded-lg">
                    <span>Switched to another tab during assessment</span>
                    <Badge variant="outline" className="text-warning">
                      {cheatingFlags.filter(f => f.type === 'tab_switch').length} time(s)
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center mt-8">
          <Button 
            onClick={() => window.location.reload()}
            variant="outline"
            className="px-8 py-3"
          >
            Take Assessment Again
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InteractiveExcelAssessment;
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, Shield, CheckCircle2, XCircle } from "lucide-react";

interface Answer {
  question: string;
  answer: string;
  score: number;
  justification: string;
}

interface CheatingFlag {
  type: 'paste' | 'tab_switch';
  timestamp: string;
}

const EXCEL_QUESTIONS = [
  "In your own words, what is the primary purpose of VLOOKUP in Excel?",
  "You have a dataset where column A contains Product IDs and column B contains Product Names. On another sheet, you have a Product ID in cell C2. Write the VLOOKUP formula to find the corresponding Product Name.",
  "What is the difference between VLOOKUP's TRUE and FALSE arguments for the [range_lookup] parameter? When would you use TRUE?",
  "VLOOKUP returns an #N/A error. List three common reasons why this might be happening.",
  "What are the main advantages of using INDEX and MATCH together over VLOOKUP?"
];

const ExcelAssessment: React.FC = () => {
  const [interviewStage, setInterviewStage] = useState<'welcome' | 'interview' | 'report'>('welcome');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [cheatingFlags, setCheatingFlags] = useState<CheatingFlag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  // Anti-cheating detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && interviewStage === 'interview') {
        setCheatingFlags(prev => [...prev, {
          type: 'tab_switch',
          timestamp: new Date().toISOString()
        }]);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [interviewStage]);

  const handlePaste = () => {
    setCheatingFlags(prev => [...prev, {
      type: 'paste',
      timestamp: new Date().toISOString()
    }]);
  };

  const evaluateAnswer = async (question: string, answer: string): Promise<{ score: number; justification: string }> => {
    if (!apiKey) {
      return { score: 0, justification: "API key required for evaluation" };
    }

    try {
      const systemPrompt = `You are an expert Excel Interviewer AI. Your role is to evaluate a candidate's answer to a specific Excel-related question.
The user will provide their answer. You must evaluate it based on the following criteria:
1. **Correctness:** Is the answer technically correct?
2. **Clarity:** Is the explanation clear and easy to understand?
3. **Completeness:** Does the answer fully address the question?

You must respond ONLY with a JSON object. The JSON object must have the following structure:
{
  "score": <an integer between 0 and 10>,
  "justification": "<a brief, one-sentence explanation for your score>"
}
Do not provide any other text or explanation outside of this JSON object.`;

      const userPrompt = `Question: "${question}"
Candidate's Answer: "${answer}"

Evaluate the candidate's answer.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: systemPrompt + "\n\n" + userPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            topK: 1,
            topP: 1,
            maxOutputTokens: 200,
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to evaluate answer');
      }

      const data = await response.json();
      const aiResponse = data.candidates[0].content.parts[0].text;
      
      // Try to parse the JSON response
      try {
        const parsed = JSON.parse(aiResponse);
        return {
          score: parsed.score || 0,
          justification: parsed.justification || "Unable to evaluate answer"
        };
      } catch {
        // If JSON parsing fails, provide a default response
        return {
          score: 5,
          justification: "Answer received but could not be properly evaluated"
        };
      }
    } catch (error) {
      console.error('Error evaluating answer:', error);
      return {
        score: 0,
        justification: "Error occurred during evaluation"
      };
    }
  };

  const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim()) return;

    setIsLoading(true);
    const question = EXCEL_QUESTIONS[currentQuestionIndex];
    const evaluation = await evaluateAnswer(question, currentAnswer);

    const newAnswer: Answer = {
      question,
      answer: currentAnswer,
      score: evaluation.score,
      justification: evaluation.justification
    };

    setAnswers(prev => [...prev, newAnswer]);
    setCurrentAnswer('');

    if (currentQuestionIndex < EXCEL_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setInterviewStage('report');
    }
    setIsLoading(false);
  };

  const startAssessment = () => {
    if (!apiKey) {
      setShowApiKeyInput(true);
      return;
    }
    setStartTime(new Date());
    setInterviewStage('interview');
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-success';
    if (score >= 6) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 8) return 'default';
    if (score >= 6) return 'secondary';
    return 'destructive';
  };

  const calculateOverallScore = () => {
    if (answers.length === 0) return 0;
    return Math.round(answers.reduce((sum, answer) => sum + answer.score, 0) / answers.length);
  };

  // Welcome Screen
  if (interviewStage === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-elegant">
          <CardHeader className="text-center pb-8">
            <div className="mx-auto mb-4 w-16 h-16 bg-gradient-primary rounded-xl flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Excel Skills Assessment
            </CardTitle>
            <CardDescription className="text-lg mt-4">
              Professional AI-powered evaluation of your Microsoft Excel expertise
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted rounded-lg p-6">
              <h3 className="font-semibold text-lg mb-3">Assessment Overview</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  5 progressively challenging Excel questions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  AI-powered evaluation and scoring
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Comprehensive performance report
                </li>
                <li className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  Academic integrity monitoring
                </li>
              </ul>
            </div>
            
            {showApiKeyInput && (
              <div className="space-y-4 border border-warning rounded-lg p-4 bg-warning/5">
                <div className="flex items-center gap-2 text-warning">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">API Key Required</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Please enter your Google Gemini API key to enable AI evaluation. Your key is stored locally and not sent to our servers.
                </p>
                <Textarea
                  placeholder="Enter your Gemini API key..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="resize-none"
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
              {showApiKeyInput && !apiKey ? 'Enter API Key to Continue' : 'Start Assessment'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Interview Screen
  if (interviewStage === 'interview') {
    const progress = ((currentQuestionIndex + 1) / EXCEL_QUESTIONS.length) * 100;
    
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold">Excel Skills Assessment</h1>
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Question {currentQuestionIndex + 1} of {EXCEL_QUESTIONS.length}
                </Badge>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel - Current Question */}
            <div className="lg:col-span-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-xl">Question {currentQuestionIndex + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="bg-muted rounded-lg p-4">
                    <p className="text-lg leading-relaxed">{EXCEL_QUESTIONS[currentQuestionIndex]}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Answer:</label>
                    <Textarea
                      value={currentAnswer}
                      onChange={(e) => setCurrentAnswer(e.target.value)}
                      onPaste={handlePaste}
                      placeholder="Type your detailed answer here..."
                      className="min-h-[200px] resize-none"
                      disabled={isLoading}
                    />
                  </div>
                  
                  <Button 
                    onClick={handleSubmitAnswer}
                    disabled={!currentAnswer.trim() || isLoading}
                    className="w-full py-3 font-semibold shadow-button"
                  >
                    {isLoading ? 'Evaluating Answer...' : 'Submit Answer'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel - Progress & Context */}
            <div className="space-y-6">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg">Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {answers.map((answer, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm">Question {index + 1}</span>
                        <Badge variant={getScoreBadgeVariant(answer.score)}>
                          {answer.score}/10
                        </Badge>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border-2 border-primary/20">
                      <span className="text-sm font-medium">Current</span>
                      <Badge variant="outline">In Progress</Badge>
                    </div>
                    {Array.from({ length: EXCEL_QUESTIONS.length - currentQuestionIndex - 1 }).map((_, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm text-muted-foreground">Question {currentQuestionIndex + index + 2}</span>
                        <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {cheatingFlags.length > 0 && (
                <Card className="shadow-card border-warning">
                  <CardHeader>
                    <CardTitle className="text-lg text-warning flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      Integrity Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {cheatingFlags.map((flag, index) => (
                        <div key={index} className="text-sm text-muted-foreground">
                          {flag.type === 'paste' ? 'Text pasted' : 'Tab switched'} at {new Date(flag.timestamp).toLocaleTimeString()}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Report Screen  
  const overallScore = calculateOverallScore();
  const totalTime = startTime ? Math.round((new Date().getTime() - startTime.getTime()) / 60000) : 0;

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
              Your Excel Skills Evaluation Report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="text-center p-6 bg-muted rounded-xl">
                <div className={`text-3xl font-bold ${getScoreColor(overallScore)}`}>
                  {overallScore}/10
                </div>
                <div className="text-sm text-muted-foreground mt-1">Overall Score</div>
              </div>
              <div className="text-center p-6 bg-muted rounded-xl">
                <div className="text-3xl font-bold text-foreground">{totalTime}m</div>
                <div className="text-sm text-muted-foreground mt-1">Time Taken</div>
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

        {/* Question-by-Question Breakdown */}
        <div className="space-y-6">
          {answers.map((answer, index) => (
            <Card key={index} className="shadow-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Question {index + 1}</CardTitle>
                  <Badge variant={getScoreBadgeVariant(answer.score)} className="text-sm">
                    {answer.score}/10
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Question:</h4>
                  <p className="text-muted-foreground bg-muted p-3 rounded-lg">{answer.question}</p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Your Answer:</h4>
                  <p className="text-muted-foreground bg-muted p-3 rounded-lg">{answer.answer}</p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">AI Evaluation:</h4>
                  <p className="text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/10">
                    {answer.justification}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Academic Integrity Summary */}
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
                    <span>Text pasted into answer field</span>
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

export default ExcelAssessment;
import os
import re
import json
import requests

def analyze_code_with_ai(code: str, filename: str, language: str, api_key: str = None) -> dict:
    """
    Analyzes code using Google's Gemini 2.5 Flash API.
    If the API call fails or no API key is provided, it falls back to the rule-based local analyzer.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        # Fall back to local analysis if no API key is provided
        return analyze_code_locally(code, filename, language, fallback_reason="No Gemini API Key provided. Running local static analysis.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
    
    prompt = f"""You are a Principal Software Engineer and Security Researcher.
Perform a strict and thorough code review on the following code.
File Name: {filename}
Language: {language}

Review requirements:
1. Identify actual bugs, runtime errors, or logical flaws.
2. Check for security vulnerabilities (hardcoded secrets, injection flaws, weak encryption).
3. Find performance bottlenecks (inefficient loops, memory leaks, redundant computations).
4. Point out code quality, readability, and style violations (bad naming, missing error handling).
5. Suggest missing edge cases (null pointer risks, division by zero, empty collections).

Return a JSON object matching this exact structure:
{{
  "overall_score": 85, // 0-100 score indicating code health (100 is flawless)
  "summary": "Short paragraph summary of the review.",
  "metrics": {{
    "bugs_count": 1,
    "security_issues_count": 0,
    "performance_issues_count": 1,
    "readability_issues_count": 1
  }},
  "issues": [
    {{
      "id": "bug-1", // unique string ID
      "type": "bug", // "bug" | "security" | "performance" | "style" | "documentation"
      "severity": "critical", // "critical" | "warning" | "suggestion"
      "file": "{filename}",
      "line": 12, // 1-indexed line number or null if general
      "title": "Short title describing the issue",
      "description": "Thorough, constructive explanation of the problem.",
      "snippet": "const badCode = x / 0;", // offending line or block
      "suggestion": "const safeCode = x !== 0 ? x / y : 0;" // code snippet or advice on how to fix
    }}
  ],
  "positive_feedback": [
    "Good structure...",
    "Proper comments..."
  ],
  "complexity_analysis": {{
    "time_complexity": "O(N) explanation",
    "space_complexity": "O(1) explanation"
  }}
}}

Here is the code to review:
```
{code}
```

Respond ONLY with valid JSON. Do not wrap it in markdown code blocks like ```json ... ```. Do not add any text before or after the JSON.
"""

    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=20)
        if response.status_code == 200:
            result_json = response.json()
            # Extract text response from Gemini structure
            candidates = result_json.get("candidates", [])
            if candidates:
                text_content = candidates[0].get("content", {}).get("parts", [])[0].get("text", "")
                
                # Strip markdown JSON wrapping if the model ignored the instructions
                text_content = text_content.strip()
                if text_content.startswith("```json"):
                    text_content = text_content[7:]
                if text_content.endswith("```"):
                    text_content = text_content[:-3]
                text_content = text_content.strip()
                
                parsed_review = json.loads(text_content)
                parsed_review["analysis_source"] = "AI (Gemini 2.5 Flash)"
                return parsed_review
            else:
                raise Exception("Empty candidates in Gemini response")
        else:
            raise Exception(f"Gemini API returned status code {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Gemini review failed: {str(e)}")
        return analyze_code_locally(
            code, 
            filename, 
            language, 
            fallback_reason=f"Gemini API Call failed ({str(e)}). Running local static analysis."
        )

def analyze_code_locally(code: str, filename: str, language: str, fallback_reason: str = None) -> dict:
    """
    A robust rule-based local static analyzer that evaluates code using regex patterns.
    Provides identical structured output to ensure application logic behaves properly.
    """
    issues = []
    lines = code.split("\n")
    
    # Pre-compile some common regex patterns
    secret_pattern = re.compile(
        r"(key|secret|password|passwd|token|credential|auth_token|api_key)\s*=\s*['\"][a-zA-Z0-9_\-\+]{16,}['\"]", 
        re.IGNORECASE
    )
    todo_pattern = re.compile(r"//\s*TODO:|#\s*TODO:|\/\*\s*TODO:", re.IGNORECASE)
    
    # Language-specific patterns
    py_sql_inject = re.compile(r"\.execute\(\s*f?['\"].*(SELECT|INSERT|UPDATE|DELETE).*\{.*\}", re.IGNORECASE)
    py_sql_inject_concat = re.compile(r"\.execute\(\s*['\"].*(SELECT|INSERT|UPDATE|DELETE).*\+.*", re.IGNORECASE)
    py_broad_except = re.compile(r"except\s*:", re.IGNORECASE)
    py_except_pass = re.compile(r"except\s+\w+\s*:\s*(pass|continue)", re.IGNORECASE)
    py_print_stmt = re.compile(r"^\s*print\(", re.IGNORECASE)
    
    js_eval = re.compile(r"\beval\s*\(", re.IGNORECASE)
    js_console = re.compile(r"console\.log\(", re.IGNORECASE)
    js_loose_eq = re.compile(r"==\s*[^=]|!=\s*[^=]", re.IGNORECASE)
    js_var = re.compile(r"\bvar\s+\w+", re.IGNORECASE)
    js_fetch_missing_catch = re.compile(r"fetch\(.*?\)(?!\.catch\(|\.then\(.*?,.*?\)|\.then\(.*?\.catch\()", re.IGNORECASE)

    bugs_count = 0
    security_issues_count = 0
    performance_issues_count = 0
    readability_issues_count = 0
    
    # 1. Check for Secrets/Keys (Applies to all languages)
    for idx, line in enumerate(lines, 1):
        if secret_pattern.search(line):
            security_issues_count += 1
            issues.append({
                "id": f"sec-{len(issues)+1}",
                "type": "security",
                "severity": "critical",
                "file": filename,
                "line": idx,
                "title": "Hardcoded Credential / Secret Found",
                "description": "Sensitive tokens or passwords should never be committed to source code. Use environment variables or a secret vault.",
                "snippet": line.strip(),
                "suggestion": "import os\napi_key = os.environ.get('API_KEY')" if language.lower() == 'python' else "const apiKey = process.env.API_KEY;"
            })
            
        if todo_pattern.search(line):
            readability_issues_count += 1
            issues.append({
                "id": f"style-{len(issues)+1}",
                "type": "style",
                "severity": "suggestion",
                "file": filename,
                "line": idx,
                "title": "Unresolved TODO Item",
                "description": "A TODO comment was found. Clean up pending tasks before merging to production.",
                "snippet": line.strip(),
                "suggestion": "Resolve the pending comment and remove the TODO tag."
            })
            
        # Check division by zero
        if "/" in line and "0" in line:
            # Match code like /0 or / 0 (excluding comments or decimals)
            clean_line = line.split("#")[0].split("//")[0] # remove comments
            if re.search(r"/\s*0\b", clean_line):
                bugs_count += 1
                issues.append({
                    "id": f"bug-{len(issues)+1}",
                    "type": "bug",
                    "severity": "critical",
                    "file": filename,
                    "line": idx,
                    "title": "Potential Division by Zero Error",
                    "description": "Dividing by constant zero will trigger a runtime error. Ensure variables are guarded against zero.",
                    "snippet": line.strip(),
                    "suggestion": "Ensure the denominator is non-zero before dividing."
                })

    # 2. Language-Specific Analysis
    lang_clean = language.lower()
    
    if lang_clean in ("python", "py"):
        for idx, line in enumerate(lines, 1):
            # Remove comments for clean scanning
            clean_line = line.split("#")[0]
            
            # SQL Injection
            if py_sql_inject.search(clean_line) or py_sql_inject_concat.search(clean_line):
                security_issues_count += 1
                issues.append({
                    "id": f"sec-{len(issues)+1}",
                    "type": "security",
                    "severity": "critical",
                    "file": filename,
                    "line": idx,
                    "title": "SQL Injection Vulnerability",
                    "description": "Raw input is directly interpolated or concatenated into a SQL statement. This exposes the application to SQL Injection attacks.",
                    "snippet": line.strip(),
                    "suggestion": "Use parameterized queries / bind parameters instead of string formatting:\ncursor.execute('SELECT * FROM users WHERE username = ?', (username,))"
                })
                
            # Broad exception
            if py_broad_except.search(clean_line):
                bugs_count += 1
                issues.append({
                    "id": f"bug-{len(issues)+1}",
                    "type": "bug",
                    "severity": "warning",
                    "file": filename,
                    "line": idx,
                    "title": "Broad Except Clause",
                    "description": "Catching all exceptions using a bare 'except:' is bad practice as it hides unexpected errors like KeyboardInterrupt or SystemExit.",
                    "snippet": line.strip(),
                    "suggestion": "Catch specific exceptions like except ValueError: or except Exception as e:"
                })
                
            # Except pass
            if py_except_pass.search(line):
                readability_issues_count += 1
                issues.append({
                    "id": f"style-{len(issues)+1}",
                    "type": "style",
                    "severity": "warning",
                    "file": filename,
                    "line": idx,
                    "title": "Silenced Exceptions",
                    "description": "Exceptions are caught but silenced with 'pass' or 'continue'. This makes debugging errors extremely difficult.",
                    "snippet": line.strip(),
                    "suggestion": "Log the exception or re-raise it:\nexcept Exception as e:\n    logger.error(f'Error occurred: {e}')\n    raise"
                })
                
            # print statements
            if py_print_stmt.search(line):
                readability_issues_count += 1
                issues.append({
                    "id": f"style-{len(issues)+1}",
                    "type": "style",
                    "severity": "suggestion",
                    "file": filename,
                    "line": idx,
                    "title": "Console print() Statement",
                    "description": "For production server code, logging frameworks should be preferred over plain print statements for better log management.",
                    "snippet": line.strip(),
                    "suggestion": "import logging\nlogger = logging.getLogger(__name__)\nlogger.info('Message')"
                })
                
    elif lang_clean in ("javascript", "js", "typescript", "ts"):
        # Combine lines to check fetch catch patterns
        full_code = "\n".join(lines)
        if "fetch(" in full_code:
            # Simplified line calculation for fetch without catch
            matches = re.finditer(r"fetch\(", full_code)
            for m in matches:
                start_char = m.start()
                line_no = full_code[:start_char].count("\n") + 1
                snippet = full_code[start_char:start_char+80].replace("\n", " ") + "..."
                
                # Check surrounding area for catch block
                context_block = full_code[start_char:start_char+400]
                if not (".catch(" in context_block or "try {" in full_code[:start_char]):
                    bugs_count += 1
                    issues.append({
                        "id": f"bug-{len(issues)+1}",
                        "type": "bug",
                        "severity": "warning",
                        "file": filename,
                        "line": line_no,
                        "title": "Unhandled Promise Rejection Risk",
                        "description": "A fetch() request does not appear to have an associated .catch() block or enclosing try-catch block, risking silent script failure on network errors.",
                        "snippet": snippet,
                        "suggestion": "fetch(url)\n  .then(res => res.json())\n  .catch(err => console.error('Fetch failed:', err));"
                    })
                    
        for idx, line in enumerate(lines, 1):
            clean_line = line.split("//")[0]
            
            # Eval call
            if js_eval.search(clean_line):
                security_issues_count += 1
                issues.append({
                    "id": f"sec-{len(issues)+1}",
                    "type": "security",
                    "severity": "critical",
                    "file": filename,
                    "line": idx,
                    "title": "Dangerous eval() Statement",
                    "description": "Using eval() executes dynamic strings which opens severe security vulnerabilities (XSS) and slows execution performance.",
                    "snippet": line.strip(),
                    "suggestion": "Use JSON.parse() or refactor to avoid dynamic evaluation of code blocks."
                })
                
            # Console log
            if js_console.search(clean_line):
                readability_issues_count += 1
                issues.append({
                    "id": f"style-{len(issues)+1}",
                    "type": "style",
                    "severity": "suggestion",
                    "file": filename,
                    "line": idx,
                    "title": "Console Log Left in Code",
                    "description": "Remove debug console.log statements before deploying to production to keep the browser log clean and avoid leaking user info.",
                    "snippet": line.strip(),
                    "suggestion": "Remove console.log or use a production logger."
                })
                
            # Loose equality
            if js_loose_eq.search(clean_line) and not ("null" in clean_line or "undefined" in clean_line):
                readability_issues_count += 1
                issues.append({
                    "id": f"style-{len(issues)+1}",
                    "type": "style",
                    "severity": "suggestion",
                    "file": filename,
                    "line": idx,
                    "title": "Loose Equality Operator (==)",
                    "description": "Using loose equality (==) can lead to unexpected type conversions. Strict equality (===) is preferred.",
                    "snippet": line.strip(),
                    "suggestion": "Change == to === and != to !==."
                })
                
            # var variables
            if js_var.search(clean_line):
                readability_issues_count += 1
                issues.append({
                    "id": f"style-{len(issues)+1}",
                    "type": "style",
                    "severity": "suggestion",
                    "file": filename,
                    "line": idx,
                    "title": "Usage of 'var' Keyword",
                    "description": "The 'var' keyword does not respect block scoping and causes hosting quirks. Use 'let' or 'const' instead.",
                    "snippet": line.strip(),
                    "suggestion": "const value = 10; // or let for variables that reassign"
                })

    # 3. Calculate Score and Mock Summary
    total_issues = len(issues)
    score_penalty = (bugs_count * 8) + (security_issues_count * 15) + (performance_issues_count * 5) + (readability_issues_count * 2)
    overall_score = max(30, 100 - score_penalty)
    
    # Generate static suggestions
    positives = [
        "Code has an structured layout with logical indentation.",
        "Variables are named descriptively in most places."
    ]
    if total_issues == 0:
        positives.append("Excellent code! No obvious code smells or errors detected locally.")
        summary = "No issues were identified during local scanning. The code follows standard structure and styling guidelines."
    else:
        summary = f"Local static analysis identified {total_issues} code quality issues. Review items relate to code safety (security risks: {security_issues_count}, logical flaws: {bugs_count}) and style formatting ({readability_issues_count})."

    complexity = {
        "time_complexity": "O(N) where N is the number of statements, due to linear execution flow.",
        "space_complexity": "O(1) auxiliary space."
    }
    
    return {
        "overall_score": overall_score,
        "summary": summary,
        "metrics": {
            "bugs_count": bugs_count,
            "security_issues_count": security_issues_count,
            "performance_issues_count": performance_issues_count,
            "readability_issues_count": readability_issues_count
        },
        "issues": issues,
        "positive_feedback": positives,
        "complexity_analysis": complexity,
        "analysis_source": "Local Static Engine",
        "fallback_reason": fallback_reason
    }

name: ask-question-after-task
description: Use when completing a user task, command, code change, installation, explanation, or review and you must ask the user after finishing whether there are any other needs to complete.
---

# ask-question-after-task

This skill enforces a consistent closing step after completing work.

## When to use

Use this skill when:

- You have completed the user's requested task
- You are about to send the final response
- The user wants a follow-up prompt asking whether more work is needed
- The workflow should always end by asking for additional needs

## Instructions

1. Complete the requested task first.
2. Summarize the result clearly and concisely.
3. After the task is complete, ask the user whether there are any other needs to complete.
4. Use the host platform's question tool when available.
5. In VS Code environments, call the ask-question style tool after the main task is done.
6. If no question tool is available, end the response with a direct follow-up question asking whether the user wants anything else completed.

## Required closing behavior

After finishing the task, ask a question equivalent to:

"是否还有其他需求需要完成？"

If the platform supports structured options, offer concise choices such as:

- No more tasks
- Continue with another task
- Explain the result in more detail

## Notes

- Do not ask the follow-up question before the task is complete.
- Do not skip the follow-up question unless the user explicitly says not to ask again.
- Keep the follow-up short and operational.

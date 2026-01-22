# randomGrading

A simple app for asking random questions to your students

# Running

```
yarn install
yarn start


cd front
yarn install
yarn start
```

Front should be running in ports 5000 (front) and 5001 (back)

# Configuring students

create a `./front/src/students.mjs` file with this format:

```js
export const classes = {
  class1: [
    "Student 1",
    "Student 2",
    "Student 3",
    "Student 4",
    "Student 5",
    "Student 6",
    "Student 7",
    "Student 8",
    "Student 9",
    "Student 10",
    "Student 11",
    "Student 12",
  ],
};
```

# Slack Checker

A CLI tool to award participation points to students who respond to Slack threads.

## Setup

1. Set your Slack token in `.env`:
   ```
   SLACK_BOT_TOKEN=xoxb-your-token
   ```

2. Ensure MongoDB is running

## Usage

```bash
# Preview matches (dry-run, no DB changes)
node slack-checker/check-responses.mjs --dry-run "<thread-url>" <course>

# Award points (with confirmation)
node slack-checker/check-responses.mjs "<thread-url>" <course>

# Award custom points, skip confirmation
node slack-checker/check-responses.mjs --yes "<thread-url>" <course> <points>
```

### Arguments
- `thread-url` - Slack thread URL (e.g., https://team.slack.com/archives/C123/p123456)
- `course` - Course name from students.mjs (e.g., webdev_spring_2026)
- `points` - Points to award (default: 2)

### Options
- `--dry-run` - Preview without writing to database
- `--yes, -y` - Skip confirmation prompt
- `--help, -h` - Show help

### How it works
1. Fetches all replies within 24 hours of the parent message
2. Matches Slack display names to student roster using fuzzy matching
3. Awards points to matched students in MongoDB

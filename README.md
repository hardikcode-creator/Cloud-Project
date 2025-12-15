# Academic Registration Bot

A conversational bot built using **AWS Lex**, **AWS Lambda**, **DynamoDB**, and **Amazon S3** to assist students with course registration, schedules, and professor reviews. The bot leverages secure AWS infrastructure to provide reliable, context-aware interactions.

## Features

- **Conversational Interface**  
  Built with **AWS Lex**, allowing students to query course details, schedules, and professor reviews in natural language.

- **Session Management**  
  Uses **DynamoDB** to maintain session states, enabling context-aware interactions across multiple queries.

- **Secure Architecture**  
  Implemented a **VPC (Virtual Private Cloud)** architecture to integrate Lambda and API Gateway, ensuring controlled access and high reliability.

- **File Storage**  
  Stores course-related files, logs, and reports securely in **Amazon S3** buckets.

## Tech Stack

- **AWS Lex** – Conversational bot interface  
- **AWS Lambda** – Serverless backend functions  
- **DynamoDB** – Session state management and data storage  
- **Amazon S3** – File storage  
- **VPC & API Gateway** – Secure architecture and controlled access  

## Setup & Deployment

1. **Clone the repository**  
   ```bash
   git clone https://github.com/hardikcode-creator/academic-registration-bot.git
   cd academic-bot
## Live Website
Check out the live website here: [Academic Registration Assistant](http://course-registeration-assistant-website.s3-website-us-east-1.amazonaws.com/)

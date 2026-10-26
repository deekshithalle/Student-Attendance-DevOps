pipeline {
  agent any
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Install dependencies') { steps { sh 'npm install' } }
    stage('Unit checks') { steps { sh 'npm test' } }
    stage('Build Docker image') {
      steps { sh 'docker build -t student-attendance:latest .' }
    }
  }
  post { always { echo 'Pipeline finished. Review stage results before deployment.' } }
}

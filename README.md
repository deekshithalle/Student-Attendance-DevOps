# Student Attendance Management System Using DevOps Tools

A starter implementation aligned to the project proposal: student management, daily attendance across seven periods, monthly calculations, low-attendance highlighting, CSV export, Selenium smoke testing, Docker, Jenkins, and Kubernetes manifests.

## Requirements
- Node.js 22 LTS recommended
- npm
- Google Chrome for Selenium testing
- Docker / Jenkins / Kubernetes only for the DevOps demonstrations

## Run locally (Windows PowerShell)
```powershell
cd Student_Attendance_DevOps_Project
npm install
npm start
```
Open http://localhost:3000

The application creates `attendance.db` automatically and seeds five demo students. Use **Add student** to register additional sample students.

## Test
In another terminal:
```powershell
npm test
```
For Selenium, keep the server running and use:
```powershell
npm run test:selenium
```
Selenium 4 can use Selenium Manager to locate/download a compatible driver. Ensure the computer has internet access on first run if the driver is not already available.

## Docker
```powershell
docker build -t student-attendance:latest .
docker run --name attendance-demo -p 3000:3000 -v attendance-data:/app/data student-attendance:latest
```
Note: for persistent SQLite storage in Docker, set `DB_PATH=/app/data/attendance.db` and mount a volume to `/app/data`. Example:
```powershell
docker run --name attendance-demo -p 3000:3000 -e DB_PATH=/app/data/attendance.db -v attendance-data:/app/data student-attendance:latest
```

## Jenkins
Create a Jenkins Pipeline job pointing to this repository and use the included `Jenkinsfile`. The Jenkins agent needs Node/npm and Docker installed, and Docker permissions configured. The example uses `sh`; on a Windows-only agent replace shell steps with `bat` steps.

## Kubernetes
Build/load or push the image so the cluster can access `student-attendance:latest`, then:
```powershell
kubectl apply -f k8s/deployment.yaml
kubectl get deployments,pods,services
```
For local clusters, image availability depends on Docker Desktop/Minikube configuration. SQLite data persistence needs a PersistentVolumeClaim or external database for a real deployment.

## Important notes for the report
- The app treats each saved student-period status as one recorded working period; monthly totals are calculated from saved records.
- Attendance percentage = Present periods / Recorded periods × 100.
- The default low-attendance threshold is 75%, configurable in `server.js`/`public/app.js` if needed.
- Demo students are fictional. Replace them with approved sample data for your submission.
- Only claim Jenkins/Kubernetes deployment or Selenium test execution in the report after you have actually run and verified those steps.

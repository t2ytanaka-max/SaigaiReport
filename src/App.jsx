import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ReportForm from './pages/ReportForm';
import ReportHistory from './pages/ReportHistory';

import PushNotificationManager from './components/PushNotificationManager';

function App() {
  return (
    <>
      <PushNotificationManager />
      <Routes>
        <Route path="/" element={<ReportHistory />} />
        <Route path="/report" element={<ReportForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;

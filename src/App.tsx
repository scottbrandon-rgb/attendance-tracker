import React, { useEffect, useState } from 'react';
import { getClasses, type Class } from './lib/api';
import CheckIn from './components/CheckIn';
import Roster from './components/Roster';
import History from './components/History';

type ViewTab = 'checkin' | 'roster' | 'history';

export default function App() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [errorClasses, setErrorClasses] = useState<string | null>(null);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('checkin');

  const loadClasses = async () => {
    setLoadingClasses(true);
    setErrorClasses(null);
    try {
      const data = await getClasses();
      setClasses(data);
      if (data.length > 0 && !activeClassId) {
        setActiveClassId(data[0].id);
      }
    } catch (err) {
      setErrorClasses(err instanceof Error ? err.message : 'Failed to load classes');
    } finally {
      setLoadingClasses(false);
    }
  };

  useEffect(() => {
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabConfig: { key: ViewTab; label: string }[] = [
    { key: 'checkin', label: 'Check-in' },
    { key: 'roster', label: 'Roster' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
            <span className="font-semibold text-gray-900 text-base">Attendance Tracker</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Loading state */}
        {loadingClasses && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg className="animate-spin h-6 w-6 mr-3 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Loading classes…
          </div>
        )}

        {/* Error state */}
        {!loadingClasses && errorClasses && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
            <strong>Error loading classes:</strong> {errorClasses}
            <button
              onClick={loadClasses}
              className="ml-3 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* No classes */}
        {!loadingClasses && !errorClasses && classes.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg font-medium mb-1">No classes found</p>
            <p className="text-sm">Add classes to your Airtable base to get started.</p>
          </div>
        )}

        {/* Main content */}
        {!loadingClasses && !errorClasses && classes.length > 0 && (
          <>
            {/* Class selector */}
            <div className="flex items-center gap-0 bg-white border border-gray-200 rounded-lg p-1 overflow-x-auto">
              {classes.map(cls => (
                <button
                  key={cls.id}
                  onClick={() => {
                    setActiveClassId(cls.id);
                    setActiveTab('checkin');
                  }}
                  className={`flex-shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeClassId === cls.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {cls.name}
                </button>
              ))}
            </div>

            {/* Content card */}
            {activeClassId && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {/* View tabs */}
                <div className="border-b border-gray-100 px-4">
                  <div className="flex items-center gap-0">
                    {tabConfig.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                          activeTab === tab.key
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab content */}
                <div className="p-4 sm:p-6">
                  {activeTab === 'checkin' && (
                    <CheckIn classId={activeClassId} />
                  )}
                  {activeTab === 'roster' && (
                    <Roster classId={activeClassId} classes={classes} />
                  )}
                  {activeTab === 'history' && (
                    <History classId={activeClassId} />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

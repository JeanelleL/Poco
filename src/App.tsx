import { AppProvider, useApp } from './app/AppProvider';
import { AppShell } from './app/AppShell';
import { OnboardingLayout } from './onboarding/OnboardingLayout';

export default function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}

function Root() {
  const { state } = useApp();
  return state.completed ? <AppShell /> : <OnboardingLayout />;
}

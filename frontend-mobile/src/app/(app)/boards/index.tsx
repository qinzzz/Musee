import { Redirect } from 'expo-router';
export default function BoardsRedirect() {
  return <Redirect href={{ pathname: '/library', params: { section: 'boards' } }} />;
}


import {
  Routes,
  Route,
  BrowserRouter
} from "react-router-dom";
import './App.css';
import NavBar from '../navbar/NavBar.js';
import Home from '../home/Home.js';
import Settings from '../settings/Settings';
import ErrorBoundary from '../errorBoundary/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
    <div className="App">
       <BrowserRouter>
      <div style={{   display: "flex", flex:"1", flexDirection: "column"}} >
        <NavBar  ></NavBar>
        <div style={{display: "flex", flex:"1", flexDirection: "column"}} >
         <Routes>
            <Route path="/" element={<Home/>}>
            
            </Route>
            <Route path="/settings" element={<Settings/>} >
            
            </Route>
          </Routes>
        </div>
      </div>
    </BrowserRouter>
    </div>
    </ErrorBoundary>
  );
}

export default App;

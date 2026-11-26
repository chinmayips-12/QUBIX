import ReactDOM from 'react-dom/client';import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
import './index.css';import {AppProvider,useApp} from './context/AppContext';import Layout from './components/Layout';
import Landing from './pages/Landing';import Login from './pages/Login';import Patient from './pages/Patient';import Doctor from './pages/Doctor';import Admin from './pages/Admin';import GuestEmergency from './pages/GuestEmergency';
const Guard=({role,children}:{role:string,children:any})=>{const {user}=useApp();return user?.role===role?children:<Navigate to="/login"/>};
ReactDOM.createRoot(document.getElementById('root')!).render(<AppProvider><BrowserRouter><Routes><Route element={<Layout/>}>
<Route path="/" element={<Landing/>}/><Route path="/login" element={<Login/>}/><Route path="/guest-emergency" element={<GuestEmergency/>}/>
<Route path="/patient" element={<Guard role="patient"><Patient/></Guard>}/><Route path="/doctor" element={<Guard role="doctor"><Doctor/></Guard>}/><Route path="/admin" element={<Guard role="admin"><Admin/></Guard>}/>
</Route></Routes></BrowserRouter></AppProvider>);

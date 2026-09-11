import { NavLink, Outlet } from 'react-router-dom';
export function Layout() { return <><header><h1>Job Application Agent</h1><nav><NavLink to="/">Dashboard</NavLink><NavLink to="/jobs">Jobs</NavLink><NavLink to="/applications">Applications</NavLink></nav></header><main><Outlet /></main></>; }

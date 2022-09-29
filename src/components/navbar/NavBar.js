import React from 'react';
import AppBar from '@mui/material/AppBar';
import { useNavigate } from "react-router-dom";
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import MenuIcon from '@mui/icons-material/Menu';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Settings from '@mui/icons-material/Settings';
import GitHubIcon from '@mui/icons-material/GitHub';
import Drawer from '@mui/material/Drawer';
import CloseIcon from '@mui/icons-material/Close';
import './NavBar.css';

const NavBar = () => {

    let navigate = useNavigate();

    const [drawerOpen, setDrawerOpen] = React.useState(false);

    const handleDrawerToggle = () => {
        setDrawerOpen(!drawerOpen);
    };

    const handleRedirect = (path, noToggle) => {

        if (!noToggle) {
            handleDrawerToggle();
        }

        const location = {
            pathname: path,
            state: { Navbar: true }
        }

        navigate(location);

    }

    const drawer = (
        <div>
            <div >
                <IconButton aria-label="Close menu" type="submit" onClick={handleDrawerToggle}  >
                    <CloseIcon />
                </IconButton>
            </div>
            <Divider />
            <List>
                <ListItem button key='contact' onClick={() => { handleRedirect('/settings') }}>
                    <ListItemIcon>{<Settings />}</ListItemIcon>
                    <ListItemText primary='Settings' />
                </ListItem>
            </List>
            <Divider />
            <List>
                <ListItem button key='github'  onClick={() => { window.location.href = 'https://github.com/plebworks/plebnode-dashboard'}}>
                    <ListItemIcon>{ <GitHubIcon />}</ListItemIcon>
                    <ListItemText primary='GitHub - Source Code' />
                </ListItem>
            </List>
            <Divider />
        </div>
    );

    return (
        <>
            <AppBar className="Header" position="sticky" style={{backgroundColor: "black"}}>
                <Toolbar className="TopBar"   >
                    <Typography className="TopLeftBar" variant="h5" component="h1" color="inherit" onClick={() => { handleRedirect('/', true) }} >
                        PlebNode<Typography component="span" style={{fontSize:"14px"}} >⚡DASHBOARD</Typography>
                    </Typography>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        edge="start"
                        onClick={handleDrawerToggle}

                    >
                        <MenuIcon />
                    </IconButton>

                </Toolbar>
            </AppBar>
            <nav aria-label="mailbox folders">
                 <Drawer
                    variant="temporary"
                    anchor="right"
                    open={drawerOpen}
                    onClose={handleDrawerToggle}

                    ModalProps={{
                        keepMounted: true
                    }}
                >
                    {drawer}
                </Drawer>

            </nav>
        </>
    )
}


export default NavBar;
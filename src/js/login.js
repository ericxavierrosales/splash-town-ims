const electron       = require('electron')
const sqlite3        = require('sqlite3')
const bcrypt         = require('bcrypt')
const path           = require('path')

const {ipcRenderer} = electron
const {dialog}      = electron.remote
const db        = new sqlite3.Database(path.join(__dirname, 'db/inventory.db'))

const loginForm = document.querySelector('#login-form')

$(document).ready(function() {
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault()
        e.stopPropagation()
        let uname = $('#login-username').val()
        let pword = $('#login-password').val()

        db.get(`SELECT rowid, fname, lname, user, pass, roleid FROM USER WHERE user = '${uname}'`, (err, user) => {
            if(err) {
                console.log(err)
            }
            else if (!user) {
                dialog.showMessageBoxSync(null, {
                    title: "Oh no!",
                    message: 'Invalid username!',
                    type: 'error'
                })
            }
            else {
                bcrypt.compare(pword, user.pass, function(err, result) {
                    if (result) {
                        ipcRenderer.send('login:success', user)
                    }
                    else {
                        dialog.showMessageBoxSync(null, {
                            title: 'Uh oh!',
                            message: 'Password is incorrect! Try again!',
                            type: 'error'
                        })
                        $('#login-password').val('')
                    }
                })
            }
        })
    })
})
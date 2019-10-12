function User(id, fname, lname, user, roleid) {
    let self = this
    this.RowId     = ko.observable(id)
    this.FirstName = ko.observable(fname)
    this.LastName  = ko.observable(lname)
    this.UserName  = ko.observable(user)
    this.RoleId    = ko.observable(roleid)

    this.FullName  = ko.computed(function() {
        return (self.FirstName() + ' ' + self.LastName())
    })

    this.RoleName = ko.computed(function() {
        switch (self.RoleId()) {
            case 1:
                return 'Administrator'
            case 2:
                return 'Cashier'
            case 3:
                return 'Manager'
            default:
                return 'Role not found'
        }
    })
}

module.exports = User
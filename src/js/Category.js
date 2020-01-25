function Category(id, name) {
    this.RowId = ko.observable(id)
    this.Name  = ko.observable(name)
    
    this.IsEditing = ko.observable(false)
    this.Icon  = () => {
        switch (this.RowId()) {
            case 1:
                return 'fas fa-hamburger'
            case 2:
                return 'fas fa-wine-glass-alt'
            case 3:
                return 'fas fa-tshirt'
            case 4:
                return 'fas fa-smile'
            case 99:
                return 'fas fa-asterisk'
            default:
                return 'fas fa-infinity'
        }
    }

    this.filterCategories = () => {
        $('#selected-category').val(this.RowId())
        $('#select-category-trigger-btn').click()
    }

    this.editCategory = () => {
        this.IsEditing(!this.IsEditing())
    }

    this.saveEditCategory = () => {
        this.IsEditing(!this.IsEditing())
        this.Name($('#category-' + this.RowId()).val())

        ipcRenderer.send('notif:send', {
            title: 'Success!',
            message: 'Category successfully renamed.'
        })
    }
}

module.exports = Category
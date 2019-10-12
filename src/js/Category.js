function Category(id, name) {
    this.RowId = ko.observable(id)
    this.Name  = ko.observable(name)
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

    this.filterCategories = function() {
        $('#selected-category').val(this.RowId())
        $('#select-category-trigger-btn').click()
    }
}

module.exports = Category
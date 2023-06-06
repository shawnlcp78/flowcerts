import FilePrivilegesContract from "./FilePrivileges.cdc"

pub contract FileShortcutsContract4 {
    access(self) var store: @{String: FileShortcut}

    pub resource FileShortcut {
        priv let key: String
        priv let a: Address
        priv let c: String
        priv let f: String

        init(key: String, a: Address, c: String, f: String) {
            self.key = key
            self.a = a
            self.c = c
            self.f = f
        }

        pub fun getA(): Address { return self.a }
        pub fun getC(): String { return self.c }
        pub fun getF(): String { return self.f }
    }

    init() {
        self.store <- {}
    }

    pub fun getA(key: String): Address {
        return self.store[key]?.getA()!
    }

    pub fun getC(key: String): String {
        return self.store[key]?.getC()!
    }

    pub fun getF(key: String): String {
        return self.store[key]?.getF()!
    }

    pub fun set(adminCapability: &FilePrivilegesContract.FileAdminIndicator, key: String, a: Address, c: String, f: String) {
        if (adminCapability.getIsAdmin() == true) {
            self.store[key] <-! create FileShortcut(key: key, a: a, c: c, f: f)
        }
        else {
            panic("Unauthorised")
        }
    }
}
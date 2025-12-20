
module.exports = function UnmissStatic(obj) {

    const handler = {
        get: function(target, prop, receiver) {

            if(prop in obj) {
                return obj[prop];
            } else {
                return function(...args) {
                    return obj.methodMissing(prop, ...args);
                }
            }
            
        }
    };

    return new Proxy(obj, handler);

}
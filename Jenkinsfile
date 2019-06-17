pipeline {
    agent any
    environment {

        //Get AWS region
        //Assume Jenkins is running on the same region as the cluster
        REGION =  sh(script:'curl -s http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region', returnStdout: true)
        STELLAR_ADDRESS = '$(aws ssm get-parameter --region $REGION --name /${Environment}/jenkins/STELLAR_ADDRESS | jq -r ".Parameter.Value")'
        STELLAR_BASE_SEED = '$(aws ssm get-parameter --region $REGION --name /${Environment}/jenkins/STELLAR_BASE_SEED | jq -r ".Parameter.Value")'
        CLUSTER_URL = '$(aws ssm get-parameter --region $REGION --name /${Environment}/jenkins/CLUSTER_URL | jq -r ".Parameter.Value")'

    }

    stages {
        stage('Checkout') {
            steps {
                  git(
                       url: 'https://github.com/kinecosystem/marketplace-server.git',
                       branch: "${BRANCH}"
                   )
            }
        }
        stage('Create secrets for tests') {
        // todo: should be on the test docker only!

            steps {
                echo 'Creating secrets for tests'
                sh "mkdir -p ./secrets/ && echo export STELLAR_BASE_SEED=$STELLAR_BASE_SEED STELLAR_ADDRESS=$STELLAR_ADDRESS > ./secrets/.secrets"
            }
        }
        // todo: only for tests?
        stage('Create-jwt-keys') {
            steps {
                echo 'Compiling'
                sh 'make create-jwt-keys'
            }
        }
        stage('Unit Test') {
            steps {
                echo 'Unit testing'
                sh '''
                    npm run transpile
	                npm test
                '''
            }
        }
        stage ('Code Quality'){
            steps {
                echo "Running codecov"
                //todo: consider using sonarcube instead
                sh './node_modules/codecov/bin/codecov'
                echo 'Todo: Quality and security plugins (FindBugs, CheckMarx, etc.)'
            }
        }
        stage('Create Docker Image') {
            steps {
                echo 'Creating docker image'
                sh 'make build-image'
            }
        }
        stage('Deploy to env') {
            steps {
                // get k8s environment

                script {
                    env['K8S_CLUSTER_URL'] = sh (
                            script: "echo $CLUSTER_URL",
                            returnStdout: true
                       ).trim()
                }
                echo "Deploying env to: $env.K8S_CLUSTER_URL"

                withKubeConfig([credentialsId: 'default2',
                serverUrl: env.K8S_CLUSTER_URL,
                clusterName: 'test'
                ]) {
                    sh '''
                        #create namespace if doesn't exists
                    cat k8s/namespace.yaml | sed 's/__ENVIRONMENT'"/${Environment}/g"  |kubectl apply -f - || true
                        #add new version (in addition to the existing version
                        SED_ARGS="s/__ENVIRONMENT/${Environment}/g; s/__SERVER_ROLE/${Role}/g; s/__VERSION/${Version}/g; s/__REPLICAS/${Num_of_instances}/g"
                        cat k8s/marketplace-public-deployment.yaml \
                          | sed  "${SED_ARGS}" \
                          | kubectl apply  -f -
                     '''
                    }

            }
        }
        stage('Integration/System tests') {
            steps {
                echo 'Todo: Testing'
            }
        }
    }
}
